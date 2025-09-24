import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";
import { fetchKeywordCoverage, type CoverageItem } from "~/utils/keyword-coverage";
import { collectAllCurrentRows, normalizeKeyword } from "~/components/data-card-helpers";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

type KeywordMetric = {
  keyword: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  rankLabel: string;
  searchVolume: number | null;
};

type CoverageDigest = {
  text: string;
  searchVolume: number | null;
  gscClicks: number | null;
  gscImpressions: number | null;
};

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const page = String(payload?.page || "").trim();
    const site = String(payload?.site || "").trim();
    if (!page || !/^https?:\/\//i.test(page)) {
      return NextResponse.json({ success: false, error: "Missing or invalid page URL." }, { status: 400 });
    }
    if (!site) {
      return NextResponse.json({ success: false, error: "Missing site token." }, { status: 400 });
    }

    const { startDate, periodDays } = resolveDateParams(payload?.startDate, payload?.periodDays);
    const ctrBenchmark = parseCtrBenchmark(payload?.ctrBenchmark ?? payload?.targetCtr ?? payload?.ctrTarget);
    const topicInput = typeof payload?.topic === "string" ? payload.topic.trim() : "";

    const searchEndpoint = new URL("/api/search/by-url", req.url);
    const searchResponse = await fetch(searchEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ site, page, startDate, periodDays }),
    });

    if (!searchResponse.ok) {
      const errorText = await safeReadText(searchResponse);
      return NextResponse.json(
        { success: false, error: "Failed to retrieve search data", status: searchResponse.status, detail: errorText?.slice(0, 400) ?? null },
        { status: 502 },
      );
    }

    const searchJson = await safeReadJson(searchResponse);
    if (!Array.isArray(searchJson) || searchJson.length === 0) {
      return NextResponse.json({ success: false, error: "No search performance data returned." }, { status: 404 });
    }

    const pageStats = searchJson[0] as Record<string, unknown>;
    const topic = topicInput || String(pageStats?.best_query || "").trim() || page;

    const keywordMetrics = buildKeywordMetrics(pageStats);

    let coverageResult: {
      covered: CoverageDigest[];
      uncovered: CoverageDigest[];
      map: Map<string, CoverageDigest>;
    } = { covered: [], uncovered: [], map: new Map() };

    try {
      const coverage = await fetchKeywordCoverage(page);
      if (coverage?.success) {
        coverageResult = buildCoverageDigest(coverage.covered, coverage.uncovered);
        enrichWithSearchVolume(keywordMetrics, coverageResult.map);
      }
    } catch (err) {
      console.error("[metatag] coverage fetch failed", err);
    }

    const sortedByImpressions = [...keywordMetrics].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));

    const targetKeyword = pickTargetKeyword(sortedByImpressions, ctrBenchmark);

    const coveredBullets = formatCoverageBullets(coverageResult.covered, 10);
    const uncoveredBullets = formatCoverageBullets(coverageResult.uncovered, 10);

    const totals = extractTotals(pageStats);

    const performanceCsv = formatPerformanceCsv(sortedByImpressions, 20);

    const prompt = buildPrompt({
      topic,
      page,
      site,
      startDate,
      periodDays,
      ctrBenchmark,
      performanceCsv,
      coveredBullets,
      uncoveredBullets,
      totals,
      targetKeyword,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        {
          role: "system",
          content:
            "You are an elite SEO strategist focused on increasing CTR via meta titles. Follow all rules in the user's instructions. Use Traditional Chinese for narrative content and keep English section headings exactly as provided. Each meta title must be concise, compelling, and under 58 characters, avoiding keyword stuffing or vague promises.",
        },
        { role: "user", content: prompt },
      ],
    });

    const report = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!report) {
      return NextResponse.json({ success: false, error: "Meta title generation returned empty response." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      report,
      targetKeyword,
      totals,
      keywords: sortedByImpressions,
      coverage: {
        covered: coverageResult.covered,
        uncovered: coverageResult.uncovered,
      },
      prompt,
    });
  } catch (err: unknown) {
    console.error("[metatag] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

function resolveDateParams(startDateInput: unknown, periodDaysInput: unknown) {
  const defaults = getDefaultDates();
  const startDate = typeof startDateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDateInput)
    ? startDateInput
    : defaults.startDate;
  const periodDays = Number.isFinite(Number(periodDaysInput)) && Number(periodDaysInput) > 0
    ? Number(periodDaysInput)
    : defaults.periodDays;
  return { startDate, periodDays };
}

function parseCtrBenchmark(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw <= 1 ? raw * 100 : raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const cleaned = raw.replace(/%/g, "").trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed <= 1 ? parsed * 100 : parsed;
    }
  }
  return 5;
}

function buildKeywordMetrics(pageStats: Record<string, unknown>): KeywordMetric[] {
  const rows = collectAllCurrentRows(pageStats);
  const map = new Map<string, KeywordMetric>();

  for (const row of rows) {
    const keyword = String(row.keyword || "").trim();
    if (!keyword) continue;
    const key = normalizeKeyword(keyword);
    if (!key) continue;

    const clicks = toNumber(row.clicks);
    const impressions = toNumber(row.impressions);
    const position = toNumber(row.position);
    const ctr = typeof row.ctr === "number" && Number.isFinite(row.ctr)
      ? row.ctr
      : impressions && impressions > 0 && typeof clicks === "number"
        ? (clicks / impressions) * 100
        : null;

    const existing = map.get(key);
    if (!existing || (impressions ?? 0) > (existing.impressions ?? 0)) {
      map.set(key, {
        keyword,
        clicks,
        impressions,
        ctr,
        position,
        rankLabel: String(row.rank || ""),
        searchVolume: existing?.searchVolume ?? null,
      });
    }
  }

  return Array.from(map.values());
}

function buildCoverageDigest(covered: CoverageItem[] | undefined, uncovered: CoverageItem[] | undefined) {
  const dedupe = (items: CoverageItem[] | undefined): CoverageDigest[] => {
    const store = new Map<string, CoverageDigest>();
    for (const item of items || []) {
      const text = String(item?.text || "").trim();
      if (!text) continue;
      const key = normalizeKeyword(text);
      if (!key) continue;
      const sv = typeof item?.searchVolume === "number" && Number.isFinite(item.searchVolume)
        ? item.searchVolume
        : null;
      const digest: CoverageDigest = {
        text,
        searchVolume: sv,
        gscClicks: toNumber(item?.gsc?.clicks),
        gscImpressions: toNumber(item?.gsc?.impressions),
      };
      const current = store.get(key);
      if (!current || (sv ?? -1) > (current.searchVolume ?? -1)) {
        store.set(key, digest);
      }
    }
    return Array.from(store.values());
  };

  const coveredDigest = dedupe(covered);
  const uncoveredDigest = dedupe(uncovered);
  const map = new Map<string, CoverageDigest>();
  for (const entry of coveredDigest) map.set(normalizeKeyword(entry.text), entry);
  for (const entry of uncoveredDigest) if (!map.has(normalizeKeyword(entry.text))) map.set(normalizeKeyword(entry.text), entry);
  return { covered: coveredDigest, uncovered: uncoveredDigest, map };
}

function enrichWithSearchVolume(metrics: KeywordMetric[], coverageMap: Map<string, CoverageDigest>) {
  metrics.forEach((metric) => {
    const info = coverageMap.get(normalizeKeyword(metric.keyword));
    if (info && typeof info.searchVolume === "number") {
      metric.searchVolume = info.searchVolume;
    }
  });
}

function pickTargetKeyword(keywords: KeywordMetric[], ctrBenchmark: number): KeywordMetric | null {
  const candidates = keywords.filter((k) => {
    return (k.impressions ?? 0) > 0 && typeof k.ctr === "number" && k.ctr < ctrBenchmark;
  });
  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0) || (a.ctr ?? Infinity) - (b.ctr ?? Infinity));
    return candidates[0] ?? null;
  }
  return keywords.length > 0 ? keywords[0]! : null;
}

function formatPerformanceCsv(keywords: KeywordMetric[], limit: number) {
  const header = "Keyword, Impressions, Clicks, CTR";
  if (!keywords.length) {
    return [header, "No data, N/A, N/A, N/A"].join("\n");
  }
  const subset = keywords.slice(0, limit);
  const lines = subset.map((k) => {
    const keyword = escapeCsvField(k.keyword);
    const impressions = formatCsvNumber(k.impressions);
    const clicks = formatCsvNumber(k.clicks);
    const ctr = formatCsvPercent(k.ctr);
    return `${keyword}, ${impressions}, ${clicks}, ${ctr}`;
  });
  return [header, ...lines].join("\n");
}

function escapeCsvField(value: string) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCsvNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  if (Math.abs(value) >= 1) {
    return Math.round(value).toString();
  }
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatCsvPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function formatCoverageBullets(entries: CoverageDigest[], limit: number) {
  if (!entries.length) return "- 無可用資料";
  const subset = [...entries]
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, limit);
  return subset
    .map((entry) => {
      const stats: string[] = [];
      if (typeof entry.searchVolume === "number") stats.push(`SV: ${formatNumber(entry.searchVolume)}`);
      if (typeof entry.gscImpressions === "number") stats.push(`Imp: ${formatNumber(entry.gscImpressions)}`);
      if (typeof entry.gscClicks === "number") stats.push(`Clicks: ${formatNumber(entry.gscClicks)}`);
      return `- ${entry.text}${stats.length ? ` (${stats.join(", ")})` : ""}`;
    })
    .join("\n");
}

function extractTotals(pageStats: Record<string, unknown>) {
  const totalClicks = toNumber(pageStats?.total_clicks);
  const totalImpressions = toNumber(pageStats?.total_impressions);
  let totalCtr = toNumber(pageStats?.total_ctr);
  if ((totalCtr === null || totalCtr === undefined) && typeof totalClicks === "number" && typeof totalImpressions === "number" && totalImpressions > 0) {
    totalCtr = (totalClicks / totalImpressions) * 100;
  }
  return {
    totalClicks,
    totalImpressions,
    totalCtr,
  };
}

function buildPrompt(params: {
  topic: string;
  page: string;
  site: string;
  startDate: string;
  periodDays: number;
  ctrBenchmark: number;
  performanceCsv: string;
  coveredBullets: string;
  uncoveredBullets: string;
  totals: { totalClicks: number | null; totalImpressions: number | null; totalCtr: number | null };
  targetKeyword: KeywordMetric | null;
}) {
  const {
    topic,
    page,
    site,
    startDate,
    periodDays,
    ctrBenchmark,
    performanceCsv,
    coveredBullets,
    uncoveredBullets,
    totals,
    targetKeyword,
  } = params;

  const topicOrUrl = topic || page;
  const benchmarkDisplay = formatPercent(ctrBenchmark);
  const totalsLine = `Clicks: ${formatNumber(totals.totalClicks)}, Impressions: ${formatNumber(totals.totalImpressions)}, CTR: ${formatPercent(totals.totalCtr)}`;
  const targetSummary = targetKeyword
    ? `Target hint → ${targetKeyword.keyword} (Impr: ${formatNumber(targetKeyword.impressions)}, CTR: ${formatPercent(targetKeyword.ctr)}, SV: ${formatNumber(targetKeyword.searchVolume ?? null)})`
    : null;

  const coverageSummary = buildCoverageComment("Covered", coveredBullets);
  const uncoveredSummary = buildCoverageComment("Uncovered", uncoveredBullets);

  const lines: string[] = [];
  lines.push("### **SOP: Meta Title Optimization for High-Potential Keywords**");
  lines.push("#### **mindset**");
  lines.push("* **User-Centric & Reverse-Engineered:** Consider the difficulty required to input a query. This reflects the user's knowledge, their understanding of the unknown, and what they must already know. Provide meta titles based on this analysis.");
  lines.push(`* **Opportunity-Driven:** The keyword with the most impressions, if its CTR is below the benchmark (e.g., ${benchmarkDisplay}), represents the biggest optimization opportunity and potential.`);
  lines.push("* **Strategy-First:** The title is the final embodiment of the strategy, not a product of inspiration.");
  lines.push("#### **task**");
  lines.push("Deconstruct keywords from the perspectives of the \"User Knowledge Spectrum\" and \"Search Intent,\" focusing on the keyword with the greatest potential opportunity.");
  lines.push(`- Topic / URL: ${topicOrUrl}`);
  lines.push("");
  lines.push("#### **thinking**");
  lines.push("**Core Analysis: Reverse-Engineer the User from the Query**");
  lines.push("**Definition:** Treat each query as the exact input the user can already type. Assume they have already skimmed existing meta titles yet remain unconvinced—your rationale must expose what those titles failed to answer.");
  lines.push("Ask: **\"What does a user need to know to be able to type this keyword?\"** Use the following framework to analyze the provided keywords.");
  lines.push("* **Low-Difficulty Query (Broad terms, e.g., \"shrine amulet\"):**");
  lines.push("* **User Knowledge:**");
  lines.push("* **Search Intent:**");
  lines.push("* **Information Gap:**");
  lines.push("* **Medium-Difficulty Query (Specific name + broad term, e.g., \"Asagaya Shrine amulet\"):**");
  lines.push("* **User Knowledge:**");
  lines.push("* **Search Intent:**");
  lines.push("* **Information Gap:**");
  lines.push("* **High-Difficulty Query (Specific name + specific detail, e.g., \"Asagaya Shrine bracelet color meaning\"):**");
  lines.push("* **User Knowledge:**");
  lines.push("* **Search Intent:**");
  lines.push("* **Information Gap:**");
  lines.push("");
  lines.push("#### **detail defined tasks**");
  lines.push("1. **Data Input & Target Identification:**");
  lines.push("* Receive performance data and the CTR benchmark.");
  lines.push("* Identify the **single target keyword** that fits the \"highest impressions, but CTR below benchmark\" profile.");
  lines.push("* Input data provided below:");
  lines.push("```");
  lines.push(performanceCsv);
  lines.push("```");
  lines.push(`* CTR Benchmark: ${benchmarkDisplay}`);
  lines.push(`* Data period: ${periodDays} days starting ${startDate}`);
  lines.push("2. **User & Query Deconstruction:**");
  lines.push("* Apply the `thinking` framework above to select at least three keywords that map to Low / Medium / High difficulty tiers.");
  lines.push("* Pinpoint the precise User Persona, Prior Knowledge, and Information Gap for each tier, highlight which keyword is the **primary target** (the highest impressions below benchmark), and explain why current SERP titles are failing that user.");
  lines.push("3. **Communication Strategy Formulation:**");
  lines.push("* Based on the target user's Information Gap, design at least two distinct communication strategies (e.g., The Guide, The Benefit-Oriented).");
  lines.push("4. **Strategy Decision Chain:**");
  lines.push("* Step 1 — Hot Topic Gate: Decide if the primary target keyword signals a time-sensitive or newsworthy event. If yes, lock in the **Amazing Event** style (entity + spark) for all proposals.");
  lines.push("* Step 2 — Short-Tail Coverage: Check if that target keyword has a short-tail variant (<=2 words) already in the query list. If it does, ensure the final titles bridge at least two distinct intents (e.g., location + benefit).");
  lines.push("* Step 3 — Evergreen Strategy: If neither condition applies, fall back to the strongest general strategy that solves the user's information gap.");
  lines.push("");
  lines.push("#### **todo**");
  lines.push("* [x] Fill in the required data (topic, benchmark, performance data).  ");
  lines.push("* [ ] Execute the `thinking` framework to analyze the queries.");
  lines.push("* [ ] Report the identified \"target keyword\" and its detailed analysis.");
  lines.push("* [ ] Run the strategy decision chain (Hot Topic → Short-Tail → Evergreen) and record the outcome.");
  lines.push("* [ ] Draft 2-3 meta title options based on the defined strategies.");
  lines.push("* [ ] Provide a rationale for each title.");
  lines.push("");
  lines.push("#### **not to do**");
  lines.push("* **Do not state known facts:** Avoid titles that only confirm information the user already knows.");
  lines.push("* **Do not be vague:** Avoid generic titles that don't make a specific \"promise\" to the user.");
  lines.push("* **Do not stuff keywords:** Focus on communicating the solution, not just listing terms.");
  lines.push("");
  lines.push("#### **notice**");
  lines.push("* The goal is to create a title that perfectly matches the user's knowledge level and bridges their specific information gap.");
  lines.push("* A low CTR on a high-impression keyword is the clearest signal of a mismatch between the user's intent and the title's promise.");
  lines.push("* For event-driven topics, combine the concrete entity (e.g., location, performer, object) with an emotional or urgent hook—describe the spark (e.g., sold out, clash, reveal) instead of generic words like ‘爭議’.");
  lines.push("* If the Hot Topic gate fires, every proposal must follow the **Amazing Event** style (entity + spark) and explicitly surface the urgency.");
  lines.push("* Each proposed title must include the primary target keyword verbatim.");
  lines.push("");
  lines.push("#### **output format**");
  lines.push("1. **Target Keyword Identified:**");
  lines.push("* [AI will fill in the identified target keyword here]");
  lines.push("2. **User & Query Deconstruction Report (from the `thinking` framework):**");
  lines.push("* **Low-Difficulty Entry:**");
  lines.push("  * **Keyword:** [AI-filled keyword]");
  lines.push("  * **User Knowledge:** [...]");
  lines.push("  * **Search Intent:** [...]");
  lines.push("  * **Core Information Gap:** [...]");
  lines.push("  * **Rationale:** [Why existing SERP titles miss this need]");
  lines.push("* **Medium-Difficulty Entry:**");
  lines.push("  * **Keyword:** [AI-filled keyword — mark with (Target Keyword) if applicable]");
  lines.push("  * **User Knowledge:** [...]");
  lines.push("  * **Search Intent:** [...]");
  lines.push("  * **Core Information Gap:** [...]");
  lines.push("  * **Rationale:** [Why existing SERP titles miss this need]");
  lines.push("* **High-Difficulty Entry:**");
  lines.push("  * **Keyword:** [AI-filled keyword]");
  lines.push("  * **User Knowledge:** [...]");
  lines.push("  * **Search Intent:** [...]");
  lines.push("  * **Core Information Gap:** [...]");
  lines.push("  * **Rationale:** [Why existing SERP titles miss this need]");
  lines.push("* **Strategy Decision Notes:**");
  lines.push("  * **Hot Topic Gate:** [Yes/No + reasoning]");
  lines.push("  * **Short-Tail Coverage:** [Yes/No + intents merged]");
  lines.push("  * **Fallback Strategy:** [Chosen general strategy if applicable]");
  lines.push("3. **Meta Title Optimization Proposals:**");
  lines.push("* **Proposal A (Strategy: [e.g., The Guide])**");
  lines.push("* **Title:** [AI-written Title A]");
  lines.push("* **Rationale:** [Explanation of how this title addresses the identified Information Gap]");
  lines.push("* **Proposal B (Strategy: [e.g., The Benefit-Oriented])**");
  lines.push("* **Title:** [AI-written Title B]");
  lines.push("* **Rationale:** [Explanation of how this title appeals to the identified Search Intent]");

  if (targetSummary) {
    lines.push("");
    lines.push(`// ${targetSummary}`);
  }

  lines.push(`// Page totals → ${totalsLine}`);
  lines.push(`// Site token → ${site}`);
  lines.push(`// Page URL → ${page}`);
  lines.push(`// Data timeframe → ${periodDays} days starting ${startDate}`);

  if (coverageSummary) {
    lines.push(`// ${coverageSummary}`);
  }
  if (uncoveredSummary) {
    lines.push(`// ${uncoveredSummary}`);
  }

  return lines.join("\n");
}

function buildCoverageComment(label: string, bullets: string) {
  if (!bullets || !bullets.trim() || bullets.trim() === "- 無可用資料") return null;
  const condensed = bullets
    .split("\n")
    .map((line) => line.replace(/^[-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
  if (!condensed) return null;
  return `${label} keywords sample → ${condensed}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return Intl.NumberFormat("en-US", { maximumFractionDigits: value < 10 ? 2 : 0 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function getDefaultDates() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 14);
  return {
    startDate: startDate.toISOString().split("T")[0]!,
    periodDays: 14,
  };
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function safeReadJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
