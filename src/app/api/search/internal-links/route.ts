import { NextResponse } from "next/server";
import { env } from "~/env";

const GSC_DB_ENDPOINT = env.GSC_DB_ENDPOINT.replace(/\/$/, "");
const TOKENIZE_ENDPOINT = "https://nlp.award-seo.com/api/v1/tokenize";
const DEFAULT_LIMIT = 5;
const DEFAULT_PERIOD_DAYS = 180;
const MIN_TOKEN_LENGTH = 2;

type UnknownRecord = Record<string, unknown>;

interface TokenizeResponse {
  status?: string;
  data?: {
    tokens?: string[];
    frequencies?: Array<{ token: string; count: number }>;
  };
}

function clampNumber(value: unknown, fallback: number, min = 1, max = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function escapeLikeToken(token: string) {
  // Protect the SQL LIKE while keeping Chinese/Japanese tokens intact
  return token.replace(/'/g, "''").replace(/[%_]/g, "").trim();
}

function sanitizeTokens(tokens: string[]) {
  const dedup = new Set<string>();
  const clean: string[] = [];

  for (const raw of tokens) {
    const trimmed = escapeLikeToken(String(raw || ""));
    if (!trimmed || trimmed.length < MIN_TOKEN_LENGTH) continue;

    const key = trimmed.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);
    clean.push(trimmed);
  }

  return clean.slice(0, 12); // keep the SQL compact
}

function fallbackTokensFromKeyword(keyword: string) {
  const pieces = keyword.split(/\s+/).filter((s) => s.trim().length >= MIN_TOKEN_LENGTH);
  return sanitizeTokens(pieces);
}

async function tokenizeKeyword(keyword: string) {
  try {
    const res = await fetch(TOKENIZE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        text: keyword,
        min_length: MIN_TOKEN_LENGTH,
        stop_words: [],
      }),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("[internal-links] tokenize upstream error", res.status, text.slice(0, 200));
      return [];
    }

    let json: TokenizeResponse | null = null;
    try {
      json = JSON.parse(text) as TokenizeResponse;
    } catch (err) {
      console.error("[internal-links] tokenize parse error", err);
      return [];
    }

    return sanitizeTokens(json?.data?.tokens || []);
  } catch (err) {
    console.error("[internal-links] tokenize failed", err);
    return [];
  }
}

function normalizeRows(data: unknown) {
  if (Array.isArray(data)) return data as UnknownRecord[];
  if (Array.isArray((data as any)?.data)) return (data as any).data as UnknownRecord[];
  if (Array.isArray((data as any)?.results)) return (data as any).results as UnknownRecord[];
  if (Array.isArray((data as any)?.rows)) return (data as any).rows as UnknownRecord[];
  return [] as UnknownRecord[];
}

function buildSql(tokens: string[], startDate?: string | null, periodDays = DEFAULT_PERIOD_DAYS, limit = DEFAULT_LIMIT) {
  const likeClauses =
    tokens.length > 0
      ? tokens.map((token) => `query ILIKE '%${token}%'`).join(" OR ")
      : "TRUE";

  const safeStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? `'${startDate}'::DATE` : null;
  const startExpr = safeStart ?? `CURRENT_DATE - INTERVAL '${periodDays} days'`;
  const endExpr = safeStart ? `${safeStart} + INTERVAL '${periodDays} days'` : "CURRENT_DATE";
  const safeLimit = Math.max(1, Math.min(50, limit));

  return `
-- Internal link suggestions (top pages by clicks for fuzzy-matched queries)
WITH filtered AS (
    SELECT 
        page,
        query,
        SUM(clicks) AS clicks,
        SUM(impressions) AS impressions,
        AVG(position) AS avg_position
    FROM {site}
    WHERE date::DATE >= ${startExpr}
      AND date::DATE < ${endExpr}
      AND (${likeClauses})
      AND page NOT LIKE '%/tag/%'
      AND page NOT LIKE '%#%'
      AND page NOT LIKE '%/category/%'
    GROUP BY page, query
),
page_stats AS (
    SELECT 
        page,
        SUM(clicks) AS total_clicks,
        SUM(impressions) AS total_impressions,
        ROUND(AVG(avg_position), 2) AS avg_position
    FROM filtered
    GROUP BY page
),
top_queries AS (
    SELECT DISTINCT ON (page)
        page,
        query AS top_query,
        clicks AS top_clicks,
        impressions AS top_impressions,
        ROUND(avg_position, 2) AS top_position
    FROM filtered
    ORDER BY page, clicks DESC
),
query_list AS (
    SELECT 
        page,
        STRING_AGG(
            query || ' (clicks:' || clicks || ', pos:' || ROUND(avg_position, 1) || ')',
            ', ' ORDER BY clicks DESC
        ) AS matched_queries
    FROM filtered
    GROUP BY page
)
SELECT 
    ps.page,
    ps.total_clicks,
    ps.total_impressions,
    ps.avg_position,
    tq.top_query,
    tq.top_clicks,
    tq.top_position,
    ql.matched_queries
FROM page_stats ps
LEFT JOIN top_queries tq ON ps.page = tq.page
LEFT JOIN query_list ql ON ps.page = ql.page
ORDER BY ps.total_clicks DESC
LIMIT ${safeLimit};
`;
}

function mapRow(row: UnknownRecord) {
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    page: String(row?.page || ""),
    clicks: toNum(row?.total_clicks ?? row?.clicks),
    impressions: toNum(row?.total_impressions ?? row?.impressions),
    position: toNum(row?.avg_position ?? row?.position),
    topQuery: row?.top_query ? String(row.top_query) : null,
    topClicks: toNum(row?.top_clicks),
    matchedQueries: row?.matched_queries ? String(row.matched_queries) : null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const site = String(body?.site || "").trim();
    const keyword = String(body?.keyword || body?.query || "").trim();
    const startDate = body?.startDate ? String(body.startDate) : null;
    const periodDays = clampNumber(body?.periodDays, DEFAULT_PERIOD_DAYS, 7, 365);
    const limit = clampNumber(body?.limit, DEFAULT_LIMIT, 1, 20);

    if (!site || !keyword) {
      return NextResponse.json({ error: "Missing site or keyword" }, { status: 400 });
    }

    const nlpTokens = await tokenizeKeyword(keyword);
    const fallback = nlpTokens.length > 0 ? [] : fallbackTokensFromKeyword(keyword);
    const tokens = nlpTokens.length > 0 ? nlpTokens : fallback;
    const sql = buildSql(tokens.length > 0 ? tokens : [escapeLikeToken(keyword)], startDate, periodDays, limit);

    const upstream = await fetch(`${GSC_DB_ENDPOINT}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ site, sql }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: upstream.status, body: text.slice(0, 400) },
        { status: 502 },
      );
    }

    let json: unknown = [];
    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error("[internal-links] upstream parse error", err);
    }

    const rows = normalizeRows(json).map(mapRow);

    return NextResponse.json({
      site,
      keyword,
      tokens,
      limit,
      periodDays,
      startDate: startDate ?? null,
      results: rows.slice(0, limit),
      sql,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
