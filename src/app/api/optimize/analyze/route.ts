import { NextResponse } from "next/server";
import { convert } from "html-to-text";
import { SchemaType } from "@google-cloud/vertexai";
import { getVertexTextModel } from "~/server/vertex/client";

export const runtime = "nodejs";
import { fetchKeywordCoverage, buildCoveragePromptParts } from "~/utils/keyword-coverage";
import type { CoverageItem } from "~/utils/keyword-coverage";
import { fetchContentExplorerForQueries } from "~/utils/search-traffic";

// Direct implementation of analyze: fetch page HTML, extract text, build prompt, call OpenAI.
export async function POST(req: Request) {
  try {
    const input = await req.json();
    const page: string = String(input?.page || "");
    if (!page) return NextResponse.json({ success: false, error: "Missing page" }, { status: 400 });

    // Step 1: Fetch article HTML
    const contentResponse = await fetch(page, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)" },
      cache: "no-store",
    });
    if (!contentResponse.ok) {
      return NextResponse.json({ success: false, error: `Fetch failed: ${contentResponse.status}` }, { status: 502 });
    }
    const html = await contentResponse.text();

    // Step 2: Extract main content (legacy behavior)
    const articleMatch = html.match(/<article[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/article>/i);
    const mainDivMatch = html.match(/<div[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i);
    const rawBlock = articleMatch?.[1] || mainDivMatch?.[1] || html;
    const textContent = convert(rawBlock, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    }).slice(0, 6000);

    // Extract meta
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const metaDescMatch = html.match(/<meta[^>]*name=\"description\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
    const ogTitleMatch = html.match(/<meta[^>]*property=\"og:title\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
    const ogDescMatch = html.match(/<meta[^>]*property=\"og:description\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
    const pageTitle = titleMatch ? titleMatch[1] : "";
    const metaDescription = metaDescMatch ? metaDescMatch[1] : "";
    const ogTitle = ogTitleMatch ? ogTitleMatch[1] : "";
    const ogDescription = ogDescMatch ? ogDescMatch[1] : "";

    // Step 3: Build prompt (aligned with legacy optimize_en_chatgpt)
    const bestQuery = input?.bestQuery ?? null;
    const highRankArray = [input?.rank1, input?.rank2, input?.rank3]
      .filter(Boolean)
      .map((line: unknown) => String(line || ""));
    let highRankLines = [...highRankArray];
    let highRankDetails = highRankLines.map((line) => parseRankKeywordLine(line));

    const prevRankArray = [
      input?.prevRank1,
      input?.prevRank2,
      input?.prevRank3,
      input?.prevRank4,
      input?.prevRank5,
      input?.prevRank6,
      input?.prevRank7,
      input?.prevRank8,
      input?.prevRank9,
      input?.prevRank10,
      input?.prevRankGt10,
    ]
      .filter(Boolean)
      .map((line: unknown) => String(line || ""));
    let prevRankLines = [...prevRankArray];
    let prevRankDetails = prevRankLines.map((line) => parseRankKeywordLine(line));

    const keywordsArray = [input?.rank4, input?.rank5, input?.rank6, input?.rank7, input?.rank8, input?.rank9, input?.rank10]
      .filter(Boolean)
      .map((line: unknown) => String(line || ""));
  let keywordLines = [...keywordsArray];
  let keywordsList = keywordLines.join("\n");
  let rankKeywordDetails = keywordLines.map((line) => parseRankKeywordLine(line));
  let zeroSvKeywords: string[] = [];

  const region = page.includes("holidaysmart.io") ? (page.match(/\/(hk|tw|sg|my|cn)\//i)?.[1]?.toLowerCase() || "hk") : "hk";
    const locale = {
      hk: { language: "繁體中文（香港）", tone: "親切、地道、生活化" },
      tw: { language: "繁體中文（台灣）", tone: "溫馨、在地、貼心" },
      cn: { language: "簡體中文（中國大陸）", tone: "專業、直接、實用" },
      sg: { language: "繁體中文（新加坡）", tone: "多元、現代、簡潔" },
      my: { language: "繁體中文（馬來西亞）", tone: "多元、友善、實用" },
    } as const;
    const currentLocale = (locale as any)[region] || locale.hk;

    // Try to enrich with keyword coverage (SV + optional GSC) for this page
    let coverageBlock = "";
    let coverageData: {
      covered: CoverageItem[];
      uncovered: CoverageItem[];
      zeroSearchVolume: CoverageItem[];
      searchVolumeMap: Record<string, number | null>;
    } | null = null;
    let contentExplorerSummary: {
      table: string;
      difficultyNotes: string[];
      formatNotes: string[];
      paaNotes: string[];
      pickedQueries: string[];
      insights: any[];
    } | null = null;
    try {
      const coverage = await fetchKeywordCoverage(page);
      if (coverage.success) {
        const { coveredText, uncoveredText } = buildCoveragePromptParts(coverage.covered, coverage.uncovered);
        coverageBlock = `\n\n# Keyword Coverage Data (for this page)\n- Covered (with GSC when available):\n${coveredText}\n\n- Uncovered (with Search Volume):\n${uncoveredText}\n`;

        // Enrich Rank 4–10 keyword list with SV if available
        const norm = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
        const svMap = new Map<string, number | null>();
        for (const item of [...(coverage.covered || []), ...(coverage.uncovered || [])]) {
          if (!item?.text) continue;
          svMap.set(norm(item.text), typeof item.searchVolume === "number" ? item.searchVolume : null);
        }
        const zeroSv = [...(coverage.covered || []), ...(coverage.uncovered || [])]
          .filter((item) => typeof item?.searchVolume === "number" && item.searchVolume === 0);
        coverageData = {
          covered: coverage.covered || [],
          uncovered: coverage.uncovered || [],
          zeroSearchVolume: zeroSv,
          searchVolumeMap: Object.fromEntries(Array.from(svMap.entries())),
        };
        zeroSvKeywords = zeroSv
          .map((item) => {
            if (item?.text) return item.text;
            const maybeKeyword = (item as unknown as { keyword?: unknown })?.keyword;
            return typeof maybeKeyword === "string" ? maybeKeyword : "";
          })
          .filter(Boolean);
    const enrichWithSV = (raw: string): string => {
      const str = String(raw || "").trim();
      const name = str.includes("(") ? str.slice(0, str.indexOf("(")).trim() : str;
      const sv = svMap.get(norm(name));
      const svPart = `SV: ${typeof sv === "number" && isFinite(sv) ? sv : "N/A"}`;
          if (str.includes("(")) {
            const inside = str.slice(str.indexOf("(") + 1, str.lastIndexOf(")") >= 0 ? str.lastIndexOf(")") : str.length).trim();
            const hasSV = /\bSV\s*:\s*/i.test(inside);
            const newInside = hasSV ? inside : (inside ? `${svPart}, ${inside}` : svPart);
            return `${name} (${newInside})`;
          }
          return `${name} (${svPart})`;
        };
        keywordLines = keywordsArray.map((line: string) => enrichWithSV(String(line)));
        keywordsList = keywordLines.join("\n");
        rankKeywordDetails = keywordLines.map((line) => parseRankKeywordLine(line));
        if (highRankLines.length > 0) {
          highRankLines = highRankLines.map((line: string) => enrichWithSV(String(line)));
          highRankDetails = highRankLines.map((line) => parseRankKeywordLine(line));
        }
        if (prevRankLines.length > 0) {
          prevRankLines = prevRankLines.map((line: string) => enrichWithSV(String(line)));
          prevRankDetails = prevRankLines.map((line) => parseRankKeywordLine(line));
        }
        zeroSvKeywords.push(
          ...rankKeywordDetails.filter((item) => item.searchVolume === 0).map((i) => i.keyword),
        );
        zeroSvKeywords.push(
          ...prevRankDetails.filter((item) => item.searchVolume === 0).map((i) => i.keyword),
        );
      }
    } catch (_) {
      // ignore coverage enrichment failures to avoid blocking core analysis
    }

    // Optional: Content Explorer enrichment (top-3 by impressions)
    let contentExplorerBlock = "";
    try {
      // Parse rank buckets to collect { keyword, impressions, position }
      const parseEntries = (raw?: string): Array<{ keyword: string; impressions: number; position: number | null }> => {
        if (!raw) return [];
        const parts = String(raw).split(/\),\s+/).map((p, i, arr) => (i < arr.length - 1 && !p.endsWith(")")) ? (p + ")") : p);
        const rows: Array<{ keyword: string; impressions: number; position: number | null }> = [];
        for (const part of parts) {
          const m = part.match(/^(.+?)\(\s*click\s*:\s*([\d.]+)\s*,\s*impression\s*:\s*([\d.]+)\s*,\s*position\s*:\s*([\d.]+)(?:\s*,\s*ctr\s*:\s*[\d.]+%\s*)?\)$/i);
          if (m) {
            const keyword = (m[1] || "").trim();
            const imps = Number(m[3]);
            const pos = Number(m[4]);
            rows.push({ keyword, impressions: isFinite(imps) ? imps : 0, position: isFinite(pos) ? pos : null });
          } else {
            const name = part.includes("(") ? part.slice(0, part.indexOf("(")).trim() : part.trim();
            if (name) rows.push({ keyword: name, impressions: 0, position: null });
          }
        }
        return rows;
      };
      const allRows = [input?.rank4, input?.rank5, input?.rank6, input?.rank7, input?.rank8, input?.rank9, input?.rank10]
        .filter(Boolean)
        .flatMap((s: string) => parseEntries(s));
      const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\u3000\s]+/g, "");
      const byKey: Record<string, { keyword: string; impressions: number; positions: number[] }> = {};
      for (const r of allRows) {
        const k = normalize(r.keyword);
        if (!k) continue;
        if (!byKey[k] || r.impressions > byKey[k].impressions) {
          byKey[k] = { keyword: r.keyword, impressions: r.impressions, positions: [] };
        }
        if (typeof r.position === "number" && isFinite(r.position)) {
          (byKey[k].positions ||= []).push(r.position);
        }
      }
      const topQueries = Object.values(byKey)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3)
        .map((x) => x.keyword);

      if (topQueries.length > 0) {
        const explorer = await fetchContentExplorerForQueries(topQueries);
        const difficultyNotes: string[] = [];
        const formatNotes: string[] = [];
        const paaNotes: string[] = [];
        const summarizeDomain = (page: any) => {
          if (!page) return "N/A";
          const domain = page.domain || page.url || "N/A";
          const da = typeof page.domainAuthority === "number" && isFinite(page.domainAuthority)
            ? `DA ${Math.round(page.domainAuthority)}`
            : null;
          const traffic = typeof page.pageTraffic === "number" && isFinite(page.pageTraffic)
            ? `Traffic ${Math.round(page.pageTraffic)}`
            : null;
          const backlinks = typeof page.backlinks === "number" && isFinite(page.backlinks)
            ? `BL ${Math.round(page.backlinks)}`
            : null;
          const keywords = typeof page.pageKeywords === "number" && isFinite(page.pageKeywords)
            ? `KW ${Math.round(page.pageKeywords)}`
            : null;
          const metrics = [traffic, da, backlinks, keywords].filter(Boolean).join(", ");
          return metrics ? `${domain} (${metrics})` : `${domain}`;
        };
        const summarizeTopPage = (page: any, index: number) => {
          if (!page) return `${index + 1}. N/A`;
          const title = page.title && String(page.title).trim() ? String(page.title).trim() : summarizeDomain(page);
          const url = page.url || page.domain || "N/A";
          const metrics: string[] = [];
          if (typeof page.pageTraffic === "number" && isFinite(page.pageTraffic)) metrics.push(`Traffic ${Math.round(page.pageTraffic)}`);
          if (typeof page.domainAuthority === "number" && isFinite(page.domainAuthority)) metrics.push(`DA ${Math.round(page.domainAuthority)}`);
          if (typeof page.backlinks === "number" && isFinite(page.backlinks)) metrics.push(`BL ${Math.round(page.backlinks)}`);
          if (typeof page.pageKeywords === "number" && isFinite(page.pageKeywords)) metrics.push(`KW ${Math.round(page.pageKeywords)}`);
          const desc = page.description && String(page.description).trim() ? String(page.description).trim() : null;
          const lines = [
            `${index + 1}. ${title}`,
            `   URL: ${url}`,
            metrics.length ? `   Metrics: ${metrics.join(", ")}` : null,
            desc ? `   Description: ${desc}` : null,
          ].filter(Boolean);
          return lines.join("\n");
        };
        // Build summary table per query
        const rowFor = (q: string) => {
          const ins = (explorer.insights || []).find((i: any) => normalize(i.query) === normalize(q));
          const pages = (ins?.pages || ins?.topPages || []) as any[];
          const withTraffic = pages.filter((p) => typeof p.pageTraffic === "number" && isFinite(p.pageTraffic) && p.pageTraffic > 0);
          const nums = (arr: any[], pick: (x: any) => number | null) => arr.map(pick).filter((n): n is number => typeof n === "number" && isFinite(n));
          const lowestDr = Math.min(...nums(withTraffic, (p) => typeof p.domainAuthority === "number" ? p.domainAuthority : null));
          const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
          const avgTraffic = avg(nums(withTraffic, (p) => p.pageTraffic as number));
          const avgKw = avg(nums(withTraffic, (p) => typeof p.pageKeywords === "number" ? p.pageKeywords : null));
          const avgBl = avg(nums(withTraffic, (p) => typeof p.backlinks === "number" ? p.backlinks : null));
          const posArr = byKey[normalize(q)]?.positions || [];
          const avgPos = posArr.length ? (posArr.reduce((a, b) => a + b, 0) / posArr.length) : null;
          const lowestDrValue = Number.isFinite(lowestDr) ? Math.round(lowestDr) : null;
          const avgBlValue = typeof avgBl === "number" && isFinite(avgBl) ? avgBl : null;
          const drStr = lowestDrValue === null ? "-" : String(lowestDrValue);
          const tStr = avgTraffic === null ? "-" : String(Math.round(avgTraffic));
          const kwStr = avgKw === null ? "-" : String(Math.round(avgKw));
          const posStr = avgPos === null ? "-" : (avgPos as number).toFixed(1);
          const blStr = avgBlValue === null ? "-" : String(Math.round(avgBlValue));

          if (ins) {
            const difficultyLabel = lowestDrValue !== null && avgBlValue !== null
              ? (lowestDrValue > 50 && avgBlValue > 10 ? "High competition" : "Manageable competition")
              : "Competition unknown";
            const lowestDrText = lowestDrValue === null ? "N/A" : String(lowestDrValue);
            const avgBlText = avgBlValue === null ? "N/A" : String(Math.round(avgBlValue));
            difficultyNotes.push(`- ${q}: ${difficultyLabel} — lowest DR ${lowestDrText}, avg BL ${avgBlText}`);

            const domainSource = pages as any[];
            const sortedDomains = [...domainSource]
              .sort((a, b) => {
                const aTraffic = typeof a.pageTraffic === "number" && isFinite(a.pageTraffic) ? a.pageTraffic : 0;
                const bTraffic = typeof b.pageTraffic === "number" && isFinite(b.pageTraffic) ? b.pageTraffic : 0;
                return bTraffic - aTraffic;
              })
              .slice(0, 10);
            const domainList = sortedDomains
              .map((page, idx) => summarizeTopPage(page, idx))
              .join("\n");
            formatNotes.push(`- ${q}: Top pages by traffic\n${domainList ? domainList.split("\n").map((line) => `  ${line}`).join("\n") : "  No pages with measurable traffic"}`);

            const paaItems = (ins.paa || [])
              .map((p: any) => String(p?.question || ""))
              .filter((question) => Boolean(question))
              .slice(0, 5);
            if (paaItems.length > 0) {
              paaNotes.push(`- ${q}: ${paaItems.join(" | ")}`);
            }
          }
          return `| ${q} | ${drStr} | ${tStr} | ${kwStr} | ${posStr} | ${blStr} |`;
        };
        const table = [
          "| Query | Lowest DR | Avg Traffic | Avg KW | Avg Pos. | Avg BL |",
          "|-------|-----------|------------:|-------:|---------:|-------:|",
          ...topQueries.map((q) => rowFor(q)),
        ].join("\n");
        const difficultySection = difficultyNotes.length
          ? `\n- Competition Difficulty (use lowest DR > 50 and avg BL > 10 to flag harder SERPs):\n${difficultyNotes.map((line) => `  ${line}`).join("\n")}`
          : "";
        const formatSection = formatNotes.length
          ? `\n- Domain Landscape Data (for AI assessment):\n${formatNotes.map((line) => `  ${line}`).join("\n")}`
          : "";
        const paaSection = paaNotes.length
          ? `\n- People Also Ask Opportunities:\n${paaNotes.map((line) => `  ${line}`).join("\n")}`
          : "";
        contentExplorerBlock = `\n\n# Content Explorer Data (Top-3 by Impressions)\n${table}${difficultySection}${formatSection}${paaSection}\n`;
        contentExplorerSummary = {
          table,
          difficultyNotes: [...difficultyNotes],
          formatNotes: [...formatNotes],
          paaNotes: [...paaNotes],
          pickedQueries: explorer.pickedQueries || topQueries,
          insights: explorer.insights || [],
        };
      }
    } catch (_) {
      // ignore explorer errors
    }

    const prompt = `
# Role and Objective
Act as an SEO semantic hijacking strategist. Analyze Rank 4–10 keyword data to identify and prioritize low-friction, high-opportunity terms for semantic equivalence with the Best Query, focusing on user satisfaction and intent match.
## Instructions
- Begin with a concise checklist (3–7 bullets) of what you will do; keep items conceptual, not implementation-level.
- Using the input data, determine which keywords present valid semantic hijacking opportunities.
- Compare each candidate with Best Query and previous best, factoring in changes and keyword tail type. Devise targeted semantic equivalence tactics.
- Do not halt or error on missing data; use 'N/A' instead.
- Follow exact output format and Markdown structure (use ##, ### headers) for automated workflows.
- Ground all analysis in data—avoid speculative or baseless recommendations.
- Ensure all language, phrasing, and title suggestions adhere to the specified regional style and tone.
**Essential Element Checklist for Each Recommendation:**
1. Does this keyword represent a "core gap" in the Best Query?
2. Does it measurably reduce user decision friction if added?
3. Would hijacking fail in its absence?
Only recommend items that answer "yes" to all three.
**Semantic Equivalence Validation:**
If a user searching the Best Query receives content for the suggested keyword, would they be satisfied? Only consider "Possibly equivalent" if yes.
## Sub-categories
- For each keyword: record its value, rank, clicks, specificity (broad/specific), and opportunity analysis.
- For each essential equivalence: compare best_query, prev_best_query, changes, and keyword tail type; present precise strategy moving forward.
- Summarize at the end: state hijacking opportunity and top recommendation clearly.

# Context Data
- Article URL: ${input.page}
- Regional language: ${currentLocale.language} - ${currentLocale.style}
- Language characteristics examples: ${currentLocale.examples}
- Tone requirements: ${currentLocale.tone}
- Existing title: ${pageTitle}
- Meta description: ${metaDescription}
- OG title: ${ogTitle}
- Best Query (Rank 1-3): "${input.bestQuery || "N/A"}" - ${input.bestQueryClicks || 0
      } clicks - Average rank ${input.bestQueryPosition || "N/A"}
- Previous Best Query: ${input.prevBestQuery
        ? `"${input.prevBestQuery}" - ${input.prevBestClicks || 0
        } clicks - Average rank ${input.prevBestPosition || "N/A"}`
        : "N/A"
      }
- Has changed: ${input.prevBestQuery && input.bestQuery !== input.prevBestQuery}
- High-performing keywords (Rank 1-3, currently ranking well):
${highRankLines.length > 0 ? highRankLines.join("\n") : "N/A"}
- Previous ranking keywords snapshot:
${prevRankLines.length > 0 ? prevRankLines.join("\n") : "N/A"}
- Keyword list (Rank 4-10):
${keywordsList}
## Data Format Explanation
- Each keyword format: keyword (rank: X, clicks: Y)
- rank: Average Google ranking
- clicks: Total clicks in past 14 days
- Specific: Low-click terms are often specific, user needs but unfamiliar
- Broad: High-click terms are often broad, familiar common terms
- Best Query change indicates attack failure/success; check new keyword scale (short/long tail)
- Article excerpt:
${textContent.substring(0, 4000)}

# Notice
alias may be input error, should ignore user input error.

# Reasoning Steps
- 1: Dissect Best Query for user intent
- 2: Rank 4–10 terms: For each, identify relationship (Equivalent / Subordinate / Related / Unrelated)
- 3: Run scenario test—does content satisfy Best Query user if substituted?
- 4: Identify article gaps and which terms can fill them
- 5: Use only Equivalent or Subordinate terms for recommendations
- 6: Evaluate synergistic value when combining terms
- 7: Decide if REPOST or NEW POST is optimal
- 8: Finalize a compact implementation checklist of only critical changes
# Output Format
- Use the following Markdown sections and tables:
## Search Characteristic Analysis
- Summarize Best Query’s core intent, user friction, key changes (3–5 sentences)
## Semantic Hijacking Opportunities
### Keyword Type Analysis (Rank 4–10)
| Keyword Type | Keywords | Relation to Original | Difficulty | Action |
|--------------|----------|---------------------|------------|--------|
| Vertical | [list] | Direct | Low | REPOST |
| Expandable | [list] | Expansion needed | Med-High | NEW POST |
| Distant | [list] | Parallel | High | NEW POST |
### Semantic Relationship Assessment
| Keyword | Relation to Best Query | Can Hijack | Rationale |
|--------------------|-----------------------|------------|-----------------------------------------------|
| Example: ferry schedule | Equivalent | ✓ | Answers direct user need for ticket search |
| ... | ... | ... | ... |
### Gap Analysis
- Best Query user needs: [describe]
- Article gaps: [list]
- Terms filling gaps: [list or N/A]
## Core Hijacking Strategy (Essential Elements Only)
### Essential Element: [Main keyword]
- **Semantic Relation**: [Equivalent/Subordinate] — [explanation]
- **User Satisfaction**: [Yes/No with brief justification]
- **Why Essential**: [Required for success or hijack fails]
- **Combination**: [Synergistic terms, if applies]
- **Target Type**: [Vertical/Expandable/Distant]
- **Hijacking Statement**: [How it matches Best Query]
- **Change Required**: [Minor/Paragraph/Structural]
- **Expected Effect**: [Anticipated outcome]
### Additional Elements: [Only if meets all tests]
### Strategy Decision
Recommendation: REPOST or NEW POST
Reason: [succinct justification]
## Implementation Priority
### Immediate Actions (Essentials)
- [1–3 mission-critical changes]
### Optional Enhancements
- [Non-essentials]
## 📝 Required Execution Items
1. Most crucial modification
2. Secondary (if needed)
- Specify if REPOST or NEW POST
# Output Requirements
- Be concise: Core insights in 3–5 sentences, actions in lists
- Data-driven: Reference specific keywords/fields
- Explicit: No vague or soft suggestions
# Error Handling
- Replace missing data with 'N/A'
- If no essential hijacking visible: state "No obvious hijacking opportunity"
# Output Format
- Default to plain text. If markdown is required, use ## and ### headers as specified and markdown tables for tabular data.
# Output Structure
Follow the exact section, table, and formatting guidance for consistency with automated workflow consumers. Never reveal chain-of-thought reasoning unless explicitly requested.
${coverageBlock}${contentExplorerBlock}`;


    console.log("\n===== RepostLens Analyze Prompt =====\n" + prompt + "\n===== End Analyze Prompt =====\n");


    // Step 4: Call Vertex (Gemini)
    const model = getVertexTextModel();
    const resp = await model.generateContent({
      systemInstruction: `## 你的角色
你是 SEO 語義劫持專家，專責分析搜尋意圖與規劃詞組等價策略。
分析指定文章的 SEO 語意劫持機會，並基於 Rank 4-10 的關鍵字數據，設計使用 Best Query 進行語意等價策略。
- Analyze the SEO intent capture potential for this article and devise strategies to leverage Rank 4-10 keyword data for semantically equivalent query planning.
`,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const analysis = extractTextFromVertex(resp) || "無法生成分析結果";

    const keywordsAnalyzed = keywordsArray.length;

    return NextResponse.json({
      success: true,
      analysis,
      keywordsAnalyzed,
      topRankKeywords: highRankDetails,
      rankKeywords: rankKeywordDetails,
      previousRankKeywords: prevRankDetails,
      contentExplorer: contentExplorerSummary,
      keywordCoverage: coverageData,
      zeroSearchVolumeSuggestions: await buildZeroSearchVolumeSuggestions(
        textContent,
        Array.from(new Set(zeroSvKeywords.filter(Boolean))).slice(0, 15)
      ),
      promptBlocks: {
        keywordCoverage: coverageBlock || null,
        contentExplorer: contentExplorerBlock || null,
      },
    }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

function toPlainText(html: string) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseRankKeywordLine(line: string) {
  const raw = String(line || "").trim();
  const keyword = raw.includes("(") ? raw.slice(0, raw.indexOf("(")).trim() : raw;
  const matchNumber = (regex: RegExp): number | null => {
    const m = raw.match(regex);
    if (!m) return null;
    const numeric = Number((m[1] || "").replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  };
  const rank = matchNumber(/rank\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  const clicks = matchNumber(/clicks?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  const impressions = matchNumber(/impressions?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i) ?? matchNumber(/imps?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  const searchVolume = matchNumber(/SV\s*:\s*([0-9]+(?:\.[0-9]+)?)/i) ?? matchNumber(/search\s*volume\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);

  return {
    keyword,
    rank,
    clicks,
    impressions,
    searchVolume,
    raw,
  };
}

function extractTextFromVertex(
  resp: Awaited<ReturnType<ReturnType<typeof getVertexTextModel>["generateContent"]>>
) {
  const parts = resp.response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

type ZeroSvSuggestion = {
  keyword: string;
  found: boolean;
  evidence?: string;
  suggestion?: string;
};

async function buildZeroSearchVolumeSuggestions(articleText: string, keywords: string[]) {
  if (!keywords.length || !articleText) return [];

  const prompt = `你是 SEO 編輯，任務是處理 0 搜尋量關鍵字，避免浪費篇幅。
請閱讀文章摘要，檢查是否出現這些關鍵字：${keywords.join(", ")}。
若有出現，指出包含該字的句子或片段，並給出「縮減/合併」建議（繁體中文，務實、簡短）。
若沒出現，可略過該關鍵字。只回傳有找到的項目。

文章摘要（截斷）：
${articleText.slice(0, 2800)}`;

  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      suggestions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            keyword: { type: SchemaType.STRING },
            found: { type: SchemaType.BOOLEAN },
            evidence: { type: SchemaType.STRING },
            suggestion: { type: SchemaType.STRING },
          },
          required: ["keyword", "found"],
        },
      },
    },
    required: ["suggestions"],
  };

  try {
    const model = getVertexTextModel();
    const resp = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    const text = extractTextFromVertex(resp);
    const parsed = JSON.parse(text) as { suggestions?: unknown };
    if (!Array.isArray(parsed?.suggestions)) return [];
    return (parsed.suggestions as ZeroSvSuggestion[]).filter((s) => s && s.found);
  } catch (err) {
    console.warn("[optimize/analyze] zero SV suggestion error", err);
    return [];
  }
}
