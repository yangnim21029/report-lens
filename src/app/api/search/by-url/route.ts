import { NextResponse } from "next/server";

// --- Helper function to get default dates ---
function getDefaultDates() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 14); // Default to the last 14 days
  return {
    // Format to YYYY-MM-DD
    startDate: startDate.toISOString().split('T')[0],
    periodDays: 14,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let site = String(body?.site || "");
    const rawPage = String(body?.page || "");

    // ADDED: Read startDate and periodDays from the request body
    // If they are not provided, use default values (last 14 days).
    const defaultDates = getDefaultDates();
    const startDate = String(body?.startDate || defaultDates.startDate);
    const periodDays = Number(body?.periodDays || defaultDates.periodDays);

    const page = rawPage.replace(/\s+/g, ""); // remove any whitespace/newlines
    // Auto-derive site from page URL if not provided
    if (!site && /^https?:\/\//i.test(page)) {
      try {
        const u = new URL(page);
        const host = u.hostname.replace(/^www\./i, "");
        site = `sc-domain:${host}`;
      } catch {}
    }
    if (!site || !page) {
      return NextResponse.json({ error: "Missing site or page" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(page)) {
      return NextResponse.json({ error: "Invalid page URL" }, { status: 400 });
    }
    // ADDED: Validate date parameters
    if (isNaN(periodDays) || periodDays <= 0) {
        return NextResponse.json({ error: "Invalid periodDays, must be a positive number." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return NextResponse.json({ error: "Invalid startDate, must be in YYYY-MM-DD format." }, { status: 400 });
    }

    // Try primary query with variants
    const variants = buildUrlVariants(page);
    try {
      // CHANGED: Pass startDate and periodDays to the query function
      const result = await queryVariants(site, variants, startDate, periodDays);
      if (result) return NextResponse.json(result, { status: 200 });
    } catch (err) {
        // Log the error from queryVariants but continue to the next strategy
        console.error("Error querying URL variants:", err);
    }

    // Fallback: try wildcard by article ID (e.g., /article/123217%)
    const likePrefix = toArticleIdPrefix(page);
    if (likePrefix) {
      // CHANGED: Pass startDate and periodDays to the LIKE query builder
      const sqlLike = buildSqlForPageLike(site, likePrefix, startDate, periodDays);
      const resp2 = await fetch(
        "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({ site, sql: sqlLike }),
        },
      );
      const text2 = await resp2.text();
      if (!resp2.ok) {
        return NextResponse.json(
          { error: "Upstream error (LIKE query)", status: resp2.status, body: text2.slice(0, 500) },
          { status: 502 },
        );
      }
      let data2: any;
      try { data2 = JSON.parse(text2); } catch { data2 = []; }
      // Normalize response data
      let result2: unknown[] = [];
      if (Array.isArray(data2)) result2 = data2;
      else if (data2?.data && Array.isArray(data2.data)) result2 = data2.data;
      else if (data2?.results && Array.isArray(data2.results)) result2 = data2.results;
      else if (data2?.rows && Array.isArray(data2.rows)) result2 = data2.rows;
      if (result2.length > 0) {
        return NextResponse.json(result2, { status: 200 });
      }
    }

    // All strategies tried; return empty array
    return NextResponse.json([], { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

function escSingleQuotes(s: string) {
  return s.replace(/'/g, "''");
}

// CHANGED: Function now accepts date parameters to build the dynamic query
function buildSqlForPage(siteToken: string, pageUrl: string, startDate: string, periodDays: number) {
  // IMPORTANT: Keep placeholder {site_hourly} for upstream substitution
  const site = `{site_hourly}`;
  const page = escSingleQuotes(pageUrl);

  // This SQL template is now filled with the provided parameters
  return `
-- Date settings (dynamically calculated from API parameters)
WITH date_settings AS (
    SELECT
        '${startDate}'::DATE AS current_period_start,
        '${startDate}'::DATE + INTERVAL '1 day' * ${periodDays} AS current_period_end,
        '${startDate}'::DATE - INTERVAL '1 day' * ${periodDays} AS previous_period_start,
        '${startDate}'::DATE AS previous_period_end,
        '${startDate}'::DATE - INTERVAL '1 day' * ${periodDays} AS total_period_start
),

-- Step 1: Base data preparation
base_data AS (
    SELECT 
        page, query, clicks, impressions, position, date::DATE as date,
        CASE 
            WHEN date::DATE >= ds.current_period_start THEN 1
            WHEN date::DATE >= ds.previous_period_start THEN 2
            ELSE 0
        END as period_flag
    FROM ${site}
    CROSS JOIN date_settings ds
    WHERE date::DATE >= ds.total_period_start
        AND date::DATE < ds.current_period_end
        AND page = '${page}'
),

-- Step 2: Aggregated data
aggregated_data AS (
    SELECT 
        page, query,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) as total_ctr,
        AVG(position) as avg_position,
        SUM(clicks) FILTER (WHERE period_flag = 1) as recent_clicks,
        AVG(position) FILTER (WHERE period_flag = 1) as recent_position,
        SUM(clicks) FILTER (WHERE period_flag = 2) as previous_clicks,
        AVG(position) FILTER (WHERE period_flag = 2) as previous_position,
        CASE 
            WHEN AVG(position) BETWEEN 1 AND 10 THEN FLOOR(AVG(position))::INT
            WHEN AVG(position) > 10 THEN 11
            ELSE NULL
        END as rank_bucket
    FROM base_data
    GROUP BY page, query
),

-- Step 3: Page statistics
page_stats AS (
    SELECT 
        page,
        SUM(total_clicks) as page_total_clicks,
        COUNT(DISTINCT query) as total_keywords,
        COUNT(DISTINCT query) FILTER (WHERE rank_bucket BETWEEN 1 AND 10 AND total_clicks > 0) as keywords_1to10_count,
        COUNT(DISTINCT query) FILTER (WHERE rank_bucket = 11 AND total_clicks > 0) as keywords_gt10_count
    FROM aggregated_data
    GROUP BY page
),

-- Step 4: Current period best query
current_best AS (
    SELECT DISTINCT ON (page)
        page, query as current_best_query, recent_clicks as current_best_clicks,
        recent_position as current_best_position
    FROM aggregated_data WHERE recent_clicks > 0 ORDER BY page, recent_clicks DESC
),

-- Step 5: Previous period best query
previous_best AS (
    SELECT DISTINCT ON (page)
        page, query as prev_best_query, previous_clicks as prev_best_clicks,
        previous_position as prev_best_position
    FROM aggregated_data WHERE previous_clicks > 0 ORDER BY page, previous_clicks DESC
),

-- Step 6: Keyword grouping
keyword_groups AS (
    SELECT 
        page, rank_bucket,
        STRING_AGG(
            query || '(click:' || total_clicks::text || ', impression:' || total_impressions::text || ', position:' || ROUND(avg_position, 1)::text || ', ctr:' || ROUND(COALESCE(total_ctr, 0) * 100, 2)::text || '%)',
            ', ' ORDER BY total_clicks DESC
        ) as keywords
    FROM aggregated_data WHERE rank_bucket IS NOT NULL AND total_clicks > 0 GROUP BY page, rank_bucket
),

-- Step 7: Keyword pivot
keyword_pivot AS (
    SELECT 
        page,
        MAX(CASE WHEN rank_bucket = 1 THEN keywords END) as rank_1,
        MAX(CASE WHEN rank_bucket = 2 THEN keywords END) as rank_2,
        MAX(CASE WHEN rank_bucket = 3 THEN keywords END) as rank_3,
        MAX(CASE WHEN rank_bucket = 4 THEN keywords END) as rank_4,
        MAX(CASE WHEN rank_bucket = 5 THEN keywords END) as rank_5,
        MAX(CASE WHEN rank_bucket = 6 THEN keywords END) as rank_6,
        MAX(CASE WHEN rank_bucket = 7 THEN keywords END) as rank_7,
        MAX(CASE WHEN rank_bucket = 8 THEN keywords END) as rank_8,
        MAX(CASE WHEN rank_bucket = 9 THEN keywords END) as rank_9,
        MAX(CASE WHEN rank_bucket = 10 THEN keywords END) as rank_10,
        MAX(CASE WHEN rank_bucket = 11 THEN keywords END) as rank_gt10
    FROM keyword_groups GROUP BY page
),

-- Step 8: Zero-click keyword aggregation
zero_click_keywords AS (
    SELECT
        page,
        STRING_AGG(
            query || '(click:0, impression:' || total_impressions::text || ', position:' || ROUND(avg_position, 1)::text || ', ctr:0.00%)',
            ', ' ORDER BY avg_position ASC
        ) as zero_click_keywords_list
    FROM aggregated_data WHERE total_clicks = 0 GROUP BY page
)

-- Final output
SELECT 
    ps.page, ps.page_total_clicks as total_clicks, cb.current_best_query as best_query,
    cb.current_best_clicks as best_query_clicks, ROUND(cb.current_best_position, 1) as best_query_position,
    CASE WHEN cb.current_best_query != pb.prev_best_query THEN '🔄 ' ELSE '' END || pb.prev_best_query as "prev_main_keyword",
    pb.prev_best_clicks as "prev_keyword_traffic", ROUND(pb.prev_best_position, 1) as "prev_keyword_rank",
    CASE WHEN cb.current_best_query = pb.prev_best_query THEN (cb.current_best_clicks - COALESCE(pb.prev_best_clicks, 0))::text ELSE 'N/A' END as "keyword_traffic_change",
    CASE WHEN cb.current_best_query = pb.prev_best_query AND pb.prev_best_position IS NOT NULL AND cb.current_best_position IS NOT NULL THEN ROUND(pb.prev_best_position - cb.current_best_position, 1)::text ELSE 'N/A' END as "keyword_rank_change",
    ps.keywords_1to10_count, ps.keywords_gt10_count, ps.total_keywords,
    ROUND(ps.keywords_1to10_count::numeric * 100.0 / NULLIF(ps.total_keywords, 0), 1) || '%' as "keywords_1to10_ratio",
    ROUND(ps.page_total_clicks * (CASE WHEN cb.current_best_position <= 4 THEN 0.7 ELSE 1.0 END + ps.keywords_1to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5)) as potential_traffic,
    CASE WHEN cb.current_best_position <= 4 THEN '0.7' ELSE '1.0' END as "main_keyword_weight",
    ROUND((CASE WHEN cb.current_best_position <= 4 THEN 0.7 ELSE 1.0 END + ps.keywords_1to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5 - 1) * 100, 1) || '%' as "potential_improvement_pct",
    kp.rank_1, kp.rank_2, kp.rank_3, kp.rank_4, kp.rank_5, kp.rank_6, kp.rank_7, kp.rank_8, kp.rank_9, kp.rank_10, kp.rank_gt10,
    zck.zero_click_keywords_list as "zero_click_keywords"
FROM page_stats ps
LEFT JOIN current_best cb ON ps.page = cb.page
LEFT JOIN previous_best pb ON ps.page = pb.page
LEFT JOIN keyword_pivot kp ON ps.page = kp.page
LEFT JOIN zero_click_keywords zck ON ps.page = zck.page
;`;
}

// CHANGED: Also updated this fallback SQL generator to accept date parameters
function buildSqlForPageLike(siteToken: string, prefix: string, startDate: string, periodDays: number) {
  // IMPORTANT: Keep placeholder {site_hourly} for upstream substitution
  const site = `{site_hourly}`;
  const like = escSingleQuotes(prefix) + '%';
  return `
-- Date settings (dynamically calculated from API parameters)
WITH date_settings AS (
    SELECT
        '${startDate}'::DATE AS current_period_start,
        '${startDate}'::DATE + INTERVAL '1 day' * ${periodDays} AS current_period_end,
        '${startDate}'::DATE - INTERVAL '1 day' * ${periodDays} AS previous_period_start,
        '${startDate}'::DATE AS previous_period_end,
        '${startDate}'::DATE - INTERVAL '1 day' * ${periodDays} AS total_period_start
),
base_data AS (
    SELECT page, query, clicks, impressions, position, date::DATE as date,
        CASE 
            WHEN date::DATE >= ds.current_period_start THEN 1
            WHEN date::DATE >= ds.previous_period_start THEN 2
            ELSE 0
        END as period_flag
    FROM ${site}
    CROSS JOIN date_settings ds
    WHERE date::DATE >= ds.total_period_start
      AND date::DATE < ds.current_period_end
      AND page LIKE '${like}'
),
-- The rest of this specific query logic remains as you originally had it.
aggregated_data AS (
    SELECT page, query,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        AVG(position) as avg_position,
        SUM(clicks) FILTER (WHERE period_flag = 1) as recent_clicks,
        AVG(position) FILTER (WHERE period_flag = 1) as recent_position,
        SUM(clicks) FILTER (WHERE period_flag = 2) as previous_clicks,
        AVG(position) FILTER (WHERE period_flag = 2) as previous_position,
        CASE WHEN AVG(position) BETWEEN 1 AND 10 THEN FLOOR(AVG(position))::INT ELSE NULL END as rank_bucket
    FROM base_data
    GROUP BY page, query
    HAVING SUM(clicks) > 0
),
page_stats AS (
    SELECT page,
        SUM(total_clicks) as page_total_clicks,
        COUNT(DISTINCT query) as total_keywords,
        COUNT(DISTINCT query) FILTER (WHERE rank_bucket IS NOT NULL) as keywords_1to10_count
    FROM aggregated_data
    GROUP BY page
),
current_best AS (
    SELECT DISTINCT ON (page) page, query as current_best_query,
        recent_clicks as current_best_clicks,
        recent_position as current_best_position
    FROM aggregated_data WHERE recent_clicks > 0 ORDER BY page, recent_clicks DESC
),
previous_best AS (
    SELECT DISTINCT ON (page) page, query as prev_best_query,
        previous_clicks as prev_best_clicks,
        previous_position as previous_position
    FROM aggregated_data WHERE previous_clicks > 0 ORDER BY page, previous_clicks DESC
)
-- Simplified final SELECT for this fallback query
SELECT 
    ps.page,
    ps.page_total_clicks as total_clicks,
    cb.current_best_query as best_query,
    cb.current_best_clicks as best_query_clicks,
    ROUND(cb.current_best_position, 1) as best_query_position
FROM page_stats ps
LEFT JOIN current_best cb ON ps.page = cb.page
LEFT JOIN previous_best pb ON ps.page = pb.page
ORDER BY ps.page_total_clicks DESC NULLS LAST
LIMIT 1;
`;
}

// CHANGED: Function now accepts and passes through the date parameters
async function queryVariants(site: string, variants: string[], startDate: string, periodDays: number): Promise<unknown[] | null> {
  for (const p of variants) {
    const sql = buildSqlForPage(site, p, startDate, periodDays);
    const response = await fetch(
      "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ site, sql }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Upstream error ${response.status}: ${text.slice(0, 500)}`);
    }
    let data: any;
    try { data = JSON.parse(text); } catch { data = []; }
    let result: unknown[] = [];
    if (Array.isArray(data)) result = data;
    else if (data?.data && Array.isArray(data.data)) result = data.data;
    else if (data?.results && Array.isArray(data.results)) result = data.results;
    else if (data?.rows && Array.isArray(data.rows)) result = data.rows;
    if (result.length > 0) {
      return result;
    }
  }
  return null;
}


// --- URL Helper Functions (no changes needed) ---
function buildUrlVariants(raw: string): string[] {
  let u: URL | null = null;
  try { u = new URL(raw); } catch { return [raw]; }
  const variants = new Set<string>();
  const proto = u.protocol === "http:" ? ["http:", "https:"] : ["https:", "http:"];
  const hosts = u.hostname.startsWith("www.")
    ? [u.hostname, u.hostname.replace(/^www\./, "")]
    : [u.hostname, "www." + u.hostname];
  const pathNoSlash = u.pathname.replace(/\/$/, "");
  const paths = pathNoSlash ? [pathNoSlash, pathNoSlash + "/"] : ["/", "/"];
  const search = u.search || "";
  const hash = "";
  for (const p of proto) {
    for (const h of hosts) {
      for (const pa of paths) {
        variants.add(`${p}//${h}${pa}${search}${hash}`);
      }
    }
  }
  const ordered = [raw, ...Array.from(variants).filter(v => v !== raw)];
  return ordered;
}

function toArticleIdPrefix(raw: string): string | null {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/^(.*?\/article\/)\d+(?:\/|$)/i);
    if (!m) return null;
    const base = `${u.protocol}//${u.hostname}${m[1]}`;
    const id = (u.pathname.match(/\/article\/(\d+)/i) || [])[1];
    if (!id) return null;
    return `${base}${id}`;
  } catch {
    return null;
  }
}
