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

    const performanceTable = formatPerformanceTable(sortedByImpressions, 15);
    const coveredBullets = formatCoverageBullets(coverageResult.covered, 10);
    const uncoveredBullets = formatCoverageBullets(coverageResult.uncovered, 10);

    const totals = extractTotals(pageStats);

    const prompt = buildPrompt({
      topic,
      page,
      site,
      startDate,
      periodDays,
      ctrBenchmark,
      performanceTable,
      coveredBullets,
      uncoveredBullets,
      totals,
      targetKeyword,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      max_tokens: 900,
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

function formatPerformanceTable(keywords: KeywordMetric[], limit: number) {
  if (!keywords.length) {
    return "| Keyword | Clicks | Impressions | CTR | Avg Position | Search Volume | Rank |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |\n| 無資料 | 0 | 0 | 0% | N/A | N/A | - |";
  }
  const subset = keywords.slice(0, limit);
  const header = "| Keyword | Clicks | Impressions | CTR | Avg Position | Search Volume | Rank |";
  const divider = "| --- | ---: | ---: | ---: | ---: | ---: | --- |";
  const lines = subset.map((k) => {
    const clicks = formatNumber(k.clicks);
    const imps = formatNumber(k.impressions);
    const ctr = formatPercent(k.ctr);
    const pos = typeof k.position === "number" ? k.position.toFixed(1) : "N/A";
    const sv = formatNumber(k.searchVolume);
    return `| ${k.keyword} | ${clicks} | ${imps} | ${ctr} | ${pos} | ${sv} | ${k.rankLabel || "-"} |`;
  });
  return [header, divider, ...lines].join("\n");
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
  performanceTable: string;
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
    performanceTable,
    coveredBullets,
    uncoveredBullets,
    totals,
    targetKeyword,
  } = params;

  const totalsLine = `Page Totals — Clicks: ${formatNumber(totals.totalClicks)}, Impressions: ${formatNumber(totals.totalImpressions)}, CTR: ${formatPercent(totals.totalCtr)}`;
  const targetLine = targetKeyword
    ? `System-identified high-potential keyword candidate: "${targetKeyword.keyword}" (Impressions: ${formatNumber(targetKeyword.impressions)}, CTR: ${formatPercent(targetKeyword.ctr)}, Search Volume: ${formatNumber(targetKeyword.searchVolume ?? null)}).`
    : "No keyword matched the benchmark criteria; choose the best available option based on the data.";

  return [
    "Meta Title Optimization for High-Potential Keywords",
    "Mindset",
    "User-Centric: Our starting point is not what we have, but what the user is missing.",
    "Opportunity-Driven: Focus on keywords with validated demand but low CTR.",
    "Strategy-First: Complete user strategy before crafting titles.",
    "",
    "Task",
    `To optimize the Meta Title for ${topic} with the goal of significantly increasing the CTR for its primary target keyword.`,
    "",
    `Performance Data covers ${periodDays} days starting ${startDate}. CTR benchmark is ${ctrBenchmark.toFixed(2)}%.`,
    targetLine,
    "",
    "Output Requirements:",
    "1. Return GitHub-flavored Markdown that pastes cleanly into Google Docs.",
    "2. Use \"##\" for every major section and \"###\" for subsections exactly as in the template.",
    "3. Keep all section headings in English, but write the narrative and bullet text in Traditional Chinese.",
    "4. Meta titles must stay under 58 characters, be specific, and skip keyword stuffing.",
    "5. Use the provided performance table and coverage bullet lists without altering the numeric values.",
    "",
    "Template to follow exactly:",
    "## Target Keyword",
    "- Keyword: <填入最終鎖定的目標關鍵字>",
    "",
    "## User Analysis Report",
    "### User Persona",
    "- <描述用戶層級>",
    "### Prior Knowledge",
    "- <使用者已有的背景認知>",
    "### Core Information Gap",
    "- <最想補足的決策資訊>",
    "",
    "## Performance Snapshot",
    "(Insert the Markdown table provided below.)",
    "",
    "## Meta Title Optimization Proposals",
    "### Proposal A (Strategy: <策略名稱>)",
    "- Title: <標題版本A>",
    "- Rationale: <為何此策略能提高CTR>",
    "### Proposal B (Strategy: <策略名稱>)",
    "- Title: <標題版本B>",
    "- Rationale: <為何此策略能提高CTR>",
    "### Proposal C (Strategy: <策略名稱>)",
    "- Title: <標題版本C>",
    "- Rationale: <為何此策略能提高CTR>",
    "(If沒有第三個方案，就省略整個 Proposal C 小節。)",
    "",
    "## Additional Context",
    `- CTR Benchmark: ${ctrBenchmark.toFixed(2)}%`,
    `- Page Totals: ${totalsLine}`,
    `- Page URL: ${page}`,
    `- Site Token: ${site}`,
    "- Coverage Insights:",
    "  - Covered Keywords: (use bullet list below)",
    "  - Uncovered Keywords: (use bullet list below)",
    "",
    "Markdown table for `## Performance Snapshot`:",
    performanceTable,
    "",
    "Bullet list for Covered Keywords (copy under Additional Context > Coverage Insights):",
    coveredBullets,
    "",
    "Bullet list for Uncovered Keywords (copy under Additional Context > Coverage Insights):",
    uncoveredBullets,
    "",
    "Reminder: weave the data-driven rationale into every meta title proposal.",
  ].join("\n");
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
