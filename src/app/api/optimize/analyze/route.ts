import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { convert } from "html-to-text";
import { env } from "~/env";
import { fetchKeywordCoverage, buildCoveragePromptParts } from "~/utils/keyword-coverage";
import { fetchContentExplorerForQueries } from "~/utils/search-traffic";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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
    const keywordsArray = [input?.rank4, input?.rank5, input?.rank6, input?.rank7, input?.rank8, input?.rank9, input?.rank10]
      .filter(Boolean);
    let keywordsList = keywordsArray.join("\n");

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
        keywordsList = keywordsArray.map((line: string) => enrichWithSV(String(line))).join("\n");
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
          const drStr = isFinite(lowestDr) ? String(lowestDr) : "-";
          const tStr = avgTraffic === null ? "-" : String(Math.round(avgTraffic));
          const kwStr = avgKw === null ? "-" : String(Math.round(avgKw));
          const posStr = avgPos === null ? "-" : (avgPos as number).toFixed(1);
          const blStr = avgBl === null ? "-" : String(Math.round(avgBl));
          return `| ${q} | ${drStr} | ${tStr} | ${kwStr} | ${posStr} | ${blStr} |`;
        };
        const table = [
          "| Query | Lowest DR | Avg Traffic | Avg KW | Avg Pos. | Avg BL |",
          "|-------|-----------|------------:|-------:|---------:|-------:|",
          ...topQueries.map((q) => rowFor(q)),
        ].join("\n");
        contentExplorerBlock = `\n\n# Content Explorer Data (Top-3 by Impressions)\n${table}\n`;
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
Keyword list (Rank 4-10):
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


    // Step 4: Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07", // most advanced model available
      messages: [
        {
          role: "system",
          content: `## 你的角色
你是 SEO 語義劫持專家，專責分析搜尋意圖與規劃詞組等價策略。
分析指定文章的 SEO 語意劫持機會，並基於 Rank 4-10 的關鍵字數據，設計使用 Best Query 進行語意等價策略。
- Analyze the SEO intent capture potential for this article and devise strategies to leverage Rank 4-10 keyword data for semantically equivalent query planning.
`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const analysis =
      completion.choices[0]?.message?.content || "無法生成分析結果";

    // Step 5: Build sections (light parsing)
    const sections = splitSections(analysis);
    const keywordsAnalyzed = keywordsArray.length;

    return NextResponse.json({ success: true, analysis, sections, keywordsAnalyzed }, { status: 200 });
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

function splitSections(md: string) {
  const get = (title: string) => {
    const re = new RegExp(`## ${title}[\\s\\S]*?(?=\n## |$)`, "i");
    const m = md.match(re);
    return m ? m[0] : "";
  };
  return {
    quickWins: get("Search Characteristic Analysis"),
    paragraphAdditions: get("Core Hijacking Strategy"),
    structuralChanges: get("Implementation Priority"),
    rawAnalysis: md,
  };
}
