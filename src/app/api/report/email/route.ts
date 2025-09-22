import { NextResponse } from "next/server";
import { convert } from "html-to-text";
import { buildEmailHtml } from "~/utils/email-builder";

interface KeywordEntry {
  keyword: string;
  rank: number | null;
  clicks: number | null;
  impressions: number | null;
  searchVolume: number | null;
  raw: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const pageUrl = sanitizeString((body as any).pageUrl);
    const analysisText = sanitizeString((body as any).analysisText);
    const contextVector = sanitizeString((body as any).contextVector);
    const outline = sanitizeString((body as any).outline);
    const bestQueryInput = sanitizeString((body as any).bestQuery);
    const apiAnalysisInput = (body as any).apiAnalysis;
    const searchData = (body as any).searchData || null;

    if (!pageUrl) {
      return NextResponse.json({ success: false, error: "Missing pageUrl" }, { status: 400 });
    }
    if (!analysisText) {
      return NextResponse.json({ success: false, error: "Missing analysisText" }, { status: 400 });
    }

    const derivedBestQuery = bestQueryInput || (searchData && sanitizeString(searchData.best_query)) || "";
    const apiAnalysis = normalizeApiAnalysis(apiAnalysisInput, searchData);

    const emailHtml = buildEmailHtml({
      pageUrl,
      bestQuery: derivedBestQuery,
      analysisText,
      apiAnalysis,
      contextVector,
      outline,
    });

    const emailText = convert(emailHtml, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        { selector: "img", format: "skip" },
      ],
      tables: ["table"],
      preserveNewlines: true,
    }).trim();

    return NextResponse.json({
      success: true,
      html: emailHtml,
      text: emailText,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function sanitizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeApiAnalysis(input: unknown, searchData: any): {
  topRankKeywords: KeywordEntry[];
  rankKeywords: KeywordEntry[];
  bestQueryPosition: number | null;
  bestQueryClicks: number | null;
} {
  if (isKeywordPayload(input)) {
    return {
      topRankKeywords: input.topRankKeywords,
      rankKeywords: input.rankKeywords,
      bestQueryPosition: normalizeNumber(input.bestQueryPosition),
      bestQueryClicks: normalizeNumber(input.bestQueryClicks),
    };
  }

  if (searchData && typeof searchData === "object") {
    return buildKeywordEntriesFromSearch(searchData);
  }

  return { topRankKeywords: [], rankKeywords: [], bestQueryPosition: null, bestQueryClicks: null };
}

function isKeywordPayload(value: unknown): value is {
  topRankKeywords: KeywordEntry[];
  rankKeywords: KeywordEntry[];
  bestQueryPosition?: number | string | null;
  bestQueryClicks?: number | string | null;
} {
  if (!value || typeof value !== "object") return false;
  const payload = value as any;
  return Array.isArray(payload.topRankKeywords) && Array.isArray(payload.rankKeywords);
}

function buildKeywordEntriesFromSearch(data: any) {
  const safeString = (key: string) => sanitizeString(data?.[key]);

  const topRankKeywords = ["current_rank_1", "current_rank_2", "current_rank_3"]
    .map((key) => parseRankKeywordLine(safeString(key)))
    .filter((item): item is KeywordEntry => !!item);

  const rankKeywords = [
    "current_rank_4",
    "current_rank_5",
    "current_rank_6",
    "current_rank_7",
    "current_rank_8",
    "current_rank_9",
    "current_rank_10",
  ]
    .map((key) => parseRankKeywordLine(safeString(key)))
    .filter((item): item is KeywordEntry => !!item);

  return {
    topRankKeywords,
    rankKeywords,
    bestQueryPosition: normalizeNumber(data?.best_query_position),
    bestQueryClicks: normalizeNumber(data?.best_query_clicks),
  };
}

function parseRankKeywordLine(raw: string): KeywordEntry | null {
  const line = sanitizeString(raw);
  if (!line) return null;

  const keyword = line.includes("(") ? line.slice(0, line.indexOf("(")).trim() : line;
  if (!keyword) return null;

  const extract = (regex: RegExp): number | null => {
    const match = line.match(regex);
    if (!match) return null;
    const value = Number((match[1] || "").replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  };

  return {
    keyword,
    rank: extract(/rank\s*:\s*([0-9]+(?:\.[0-9]+)?)/i),
    clicks: extract(/clicks?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i),
    impressions:
      extract(/impressions?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i) ||
      extract(/imps?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i),
    searchVolume:
      extract(/SV\s*:\s*([0-9]+(?:\.[0-9]+)?)/i) ||
      extract(/search\s*volume\s*:\s*([0-9]+(?:\.[0-9]+)?)/i),
    raw: line,
  };
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}
