import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const site = String(body?.site || "");
    if (!site) return NextResponse.json({ error: "Missing site" }, { status: 400 });

    const sql = buildSqlForList(site);
    const response = await fetch(
      "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ site, sql }),
      },
    );
    if (!response.ok) {
      return NextResponse.json({ error: `Upstream error ${response.status}` }, { status: 502 });
    }
    const data = await response.json();
    let result: unknown[] = [];
    if (Array.isArray(data)) result = data;
    else if (data?.data && Array.isArray(data.data)) result = data.data;
    else if (data?.results && Array.isArray(data.results)) result = data.results;
    else if (data?.rows && Array.isArray(data.rows)) result = data.rows;
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

function buildSqlForList(siteToken: string) {
  // Keep {site} placeholder for upstream substitution; do not inline siteToken here
  return `-- This SQL query has been modified to show rank distribution for both current and previous periods.

-- Date settings
WITH date_settings AS (
    SELECT 
        CURRENT_DATE - INTERVAL '7 days' as current_period_start,
        CURRENT_DATE as current_period_end,
        CURRENT_DATE - INTERVAL '14 days' as previous_period_start,
        CURRENT_DATE - INTERVAL '7 days' as previous_period_end,
        CURRENT_DATE - INTERVAL '14 days' as total_period_start
),

-- Step 1: Base data preparation (single scan)
base_data AS (
    SELECT 
        page,
        REPLACE(query, ' ', '') as query,
        clicks,
        impressions,
        position,
        date::DATE as date,
        CASE 
            WHEN date::DATE >= (SELECT current_period_start FROM date_settings) THEN 1 -- Current Period
            WHEN date::DATE >= (SELECT previous_period_start FROM date_settings) THEN 2 -- Previous Period
            ELSE 0
        END as period_flag
    FROM {site_hourly}
    CROSS JOIN date_settings ds
    WHERE date::DATE >= ds.total_period_start
        AND date::DATE < ds.current_period_end
        AND page NOT LIKE '%#%'
        AND page IN (
            SELECT page 
            FROM {site_hourly}
            CROSS JOIN date_settings ds2
            WHERE date::DATE >= ds2.total_period_start
              AND page NOT LIKE '%#%'
            GROUP BY page
            HAVING SUM(clicks) > 50
        )
),

-- Step 2: Aggregated data -- MODIFIED to include period-specific ranks
aggregated_data AS (
    SELECT 
        page,
        query,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        
        -- Period-specific aggregations
        SUM(clicks) FILTER (WHERE period_flag = 1) as recent_clicks,
        SUM(impressions) FILTER (WHERE period_flag = 1) as recent_impressions,
        AVG(position) FILTER (WHERE period_flag = 1) as recent_avg_position,

        SUM(clicks) FILTER (WHERE period_flag = 2) as previous_clicks,
        SUM(impressions) FILTER (WHERE period_flag = 2) as previous_impressions,
        AVG(position) FILTER (WHERE period_flag = 2) as previous_avg_position,

        -- MODIFIED: Create rank buckets for each period
        CASE 
            WHEN AVG(position) FILTER (WHERE period_flag = 1) BETWEEN 1 AND 10 THEN FLOOR(AVG(position) FILTER (WHERE period_flag = 1))::INT
            WHEN AVG(position) FILTER (WHERE period_flag = 1) > 10 THEN 11
            ELSE NULL
        END as current_rank_bucket,
        
        CASE 
            WHEN AVG(position) FILTER (WHERE period_flag = 2) BETWEEN 1 AND 10 THEN FLOOR(AVG(position) FILTER (WHERE period_flag = 2))::INT
            WHEN AVG(position) FILTER (WHERE period_flag = 2) > 10 THEN 11
            ELSE NULL
        END as previous_rank_bucket

    FROM base_data
    GROUP BY page, query
),

-- Step 3: Page statistics -- MODIFIED for period-specific counts
page_stats AS (
    SELECT 
        page,
        SUM(total_clicks) as page_total_clicks,
        SUM(total_impressions) as page_total_impressions,
        COUNT(DISTINCT query) as total_keywords,
        
        -- Current period keyword counts
        COUNT(DISTINCT query) FILTER (WHERE current_rank_bucket BETWEEN 1 AND 10 AND COALESCE(recent_clicks, 0) > 0) as current_keywords_1to10_count,
        COUNT(DISTINCT query) FILTER (WHERE current_rank_bucket = 11 AND COALESCE(recent_clicks, 0) > 0) as current_keywords_gt10_count,

        -- Previous period keyword counts
        COUNT(DISTINCT query) FILTER (WHERE previous_rank_bucket BETWEEN 1 AND 10 AND COALESCE(previous_clicks, 0) > 0) as previous_keywords_1to10_count,
        COUNT(DISTINCT query) FILTER (WHERE previous_rank_bucket = 11 AND COALESCE(previous_clicks, 0) > 0) as previous_keywords_gt10_count
    FROM aggregated_data
    GROUP BY page
),

-- Step 4 & 5: Best queries (no changes needed here)
current_best AS (
    SELECT DISTINCT ON (page) page, query as current_best_query, recent_clicks as current_best_clicks, recent_avg_position as current_best_position
    FROM aggregated_data WHERE COALESCE(recent_clicks, 0) > 0 ORDER BY page, recent_clicks DESC
),
previous_best AS (
    SELECT DISTINCT ON (page) page, query as prev_best_query, previous_clicks as prev_best_clicks, previous_avg_position as prev_best_position
    FROM aggregated_data WHERE COALESCE(previous_clicks, 0) > 0 ORDER BY page, previous_clicks DESC
),

-- NEW Step 6a: Keyword grouping for CURRENT period
current_keyword_groups AS (
    SELECT 
        page,
        current_rank_bucket,
        STRING_AGG(
            query || '(click:' || recent_clicks::text || ', impression:' || recent_impressions::text || ', position:' || ROUND(recent_avg_position, 1)::text || ')',
            ', '
            ORDER BY recent_clicks DESC
        ) as keywords
    FROM aggregated_data
    WHERE current_rank_bucket IS NOT NULL AND COALESCE(recent_clicks, 0) > 0
    GROUP BY page, current_rank_bucket
),

-- NEW Step 6b: Keyword pivot for CURRENT period
current_keyword_pivot AS (
    SELECT 
        page,
        MAX(CASE WHEN current_rank_bucket = 1 THEN keywords END) as current_rank_1, MAX(CASE WHEN current_rank_bucket = 2 THEN keywords END) as current_rank_2,
        MAX(CASE WHEN current_rank_bucket = 3 THEN keywords END) as current_rank_3, MAX(CASE WHEN current_rank_bucket = 4 THEN keywords END) as current_rank_4,
        MAX(CASE WHEN current_rank_bucket = 5 THEN keywords END) as current_rank_5, MAX(CASE WHEN current_rank_bucket = 6 THEN keywords END) as current_rank_6,
        MAX(CASE WHEN current_rank_bucket = 7 THEN keywords END) as current_rank_7, MAX(CASE WHEN current_rank_bucket = 8 THEN keywords END) as current_rank_8,
        MAX(CASE WHEN current_rank_bucket = 9 THEN keywords END) as current_rank_9, MAX(CASE WHEN current_rank_bucket = 10 THEN keywords END) as current_rank_10,
        MAX(CASE WHEN current_rank_bucket = 11 THEN keywords END) as current_rank_gt10
    FROM current_keyword_groups GROUP BY page
),

-- NEW Step 7a: Keyword grouping for PREVIOUS period
previous_keyword_groups AS (
    SELECT 
        page,
        previous_rank_bucket,
        STRING_AGG(
            query || '(click:' || previous_clicks::text || ', impression:' || previous_impressions::text || ', position:' || ROUND(previous_avg_position, 1)::text || ')',
            ', '
            ORDER BY previous_clicks DESC
        ) as keywords
    FROM aggregated_data
    WHERE previous_rank_bucket IS NOT NULL AND COALESCE(previous_clicks, 0) > 0
    GROUP BY page, previous_rank_bucket
),

-- NEW Step 7b: Keyword pivot for PREVIOUS period
previous_keyword_pivot AS (
    SELECT 
        page,
        MAX(CASE WHEN previous_rank_bucket = 1 THEN keywords END) as prev_rank_1, MAX(CASE WHEN previous_rank_bucket = 2 THEN keywords END) as prev_rank_2,
        MAX(CASE WHEN previous_rank_bucket = 3 THEN keywords END) as prev_rank_3, MAX(CASE WHEN previous_rank_bucket = 4 THEN keywords END) as prev_rank_4,
        MAX(CASE WHEN previous_rank_bucket = 5 THEN keywords END) as prev_rank_5, MAX(CASE WHEN previous_rank_bucket = 6 THEN keywords END) as prev_rank_6,
        MAX(CASE WHEN previous_rank_bucket = 7 THEN keywords END) as prev_rank_7, MAX(CASE WHEN previous_rank_bucket = 8 THEN keywords END) as prev_rank_8,
        MAX(CASE WHEN previous_rank_bucket = 9 THEN keywords END) as prev_rank_9, MAX(CASE WHEN previous_rank_bucket = 10 THEN keywords END) as prev_rank_10,
        MAX(CASE WHEN previous_rank_bucket = 11 THEN keywords END) as prev_rank_gt10
    FROM previous_keyword_groups GROUP BY page
),

-- Step 8: Zero-click keywords (optional, can be kept as is)
zero_click_keywords AS (
    SELECT
        page,
        STRING_AGG(
            query || '(impression:' || total_impressions::text || ')',
            ', ' ORDER BY total_impressions DESC
        ) as zero_click_keywords_list
    FROM aggregated_data
    WHERE total_clicks = 0
    GROUP BY page
)

-- Final output -- MODIFIED to include new columns
SELECT 
    ps.page,
    ps.page_total_clicks as total_clicks,
    ps.page_total_impressions as total_impressions,
    ROUND(ps.page_total_clicks::numeric * 100.0 / NULLIF(ps.page_total_impressions, 0), 2) as total_ctr,
    cb.current_best_query as best_query,
    cb.current_best_clicks as best_query_clicks,
    ROUND(cb.current_best_position, 1) as best_query_position,
    
    -- Comparison columns
    CASE WHEN cb.current_best_query != pb.prev_best_query THEN '🔄 ' ELSE '' END || pb.prev_best_query as "prev_main_keyword",
    pb.prev_best_clicks as "prev_keyword_traffic",
    ROUND(pb.prev_best_position, 1) as "prev_keyword_rank",
    CASE WHEN cb.current_best_query = pb.prev_best_query THEN (cb.current_best_clicks - COALESCE(pb.prev_best_clicks, 0))::text ELSE 'N/A' END as "keyword_traffic_change",
    CASE WHEN cb.current_best_query = pb.prev_best_query AND pb.prev_best_position IS NOT NULL AND cb.current_best_position IS NOT NULL THEN ROUND(pb.prev_best_position - cb.current_best_position, 1)::text ELSE 'N/A' END as "keyword_rank_change",
    
    -- Page stats
    ps.current_keywords_1to10_count as "keywords_1to10_count",
    ps.current_keywords_gt10_count as "keywords_gt10_count",
    ps.total_keywords as "total_keywords",
    ROUND(ps.current_keywords_1to10_count::numeric * 100.0 / NULLIF(ps.total_keywords, 0), 1) || '%' as "keywords_1to10_ratio",
    
    -- Traffic potential columns (using current period data)
    ROUND(
        ps.page_total_clicks * (CASE WHEN cb.current_best_position <= 4 THEN 0.7 ELSE 1.0 END + ps.current_keywords_1to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5)
    ) as potential_traffic,
    
    -- Current Period Rank Distribution
    ckp.current_rank_1, ckp.current_rank_2, ckp.current_rank_3,
    ckp.current_rank_4, ckp.current_rank_5, ckp.current_rank_6, ckp.current_rank_7,
    ckp.current_rank_8, ckp.current_rank_9, ckp.current_rank_10, ckp.current_rank_gt10,
    
    -- Previous Period Rank Distribution
    pkp.prev_rank_1, pkp.prev_rank_2, pkp.prev_rank_3,
    pkp.prev_rank_4, pkp.prev_rank_5, pkp.prev_rank_6, pkp.prev_rank_7,
    pkp.prev_rank_8, pkp.prev_rank_9, pkp.prev_rank_10, pkp.prev_rank_gt10,
    
    -- Zero-click keywords
    zck.zero_click_keywords_list as "zero_click_keywords"

FROM page_stats ps
INNER JOIN current_best cb ON ps.page = cb.page
LEFT JOIN previous_best pb ON ps.page = pb.page
LEFT JOIN current_keyword_pivot ckp ON ps.page = ckp.page -- MODIFIED JOIN
LEFT JOIN previous_keyword_pivot pkp ON ps.page = pkp.page -- NEW JOIN
LEFT JOIN zero_click_keywords zck ON ps.page = zck.page
WHERE ps.page_total_clicks > 50
ORDER BY potential_traffic DESC NULLS LAST
LIMIT 100;`;
}
