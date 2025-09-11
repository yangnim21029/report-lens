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
  return `-- 日期設定區
WITH date_settings AS (
    SELECT 
        CURRENT_DATE - INTERVAL '7 days' as current_period_start,
        CURRENT_DATE as current_period_end,
        CURRENT_DATE - INTERVAL '14 days' as previous_period_start,
        CURRENT_DATE - INTERVAL '7 days' as previous_period_end,
        CURRENT_DATE - INTERVAL '14 days' as total_period_start
),
base_data AS (
    SELECT page, query, clicks, position, date::DATE as date,
        CASE 
            WHEN date::DATE >= (SELECT current_period_start FROM date_settings) THEN 1
            WHEN date::DATE >= (SELECT previous_period_start FROM date_settings) THEN 2
            ELSE 0
        END as period_flag
    FROM {site}
    CROSS JOIN date_settings ds
    WHERE date::DATE >= ds.total_period_start
      AND date::DATE < ds.current_period_end
      AND page IN (
        SELECT page FROM {site}
        CROSS JOIN date_settings ds2
        WHERE date::DATE >= ds2.total_period_start
        GROUP BY page
        HAVING SUM(clicks) > 50
      )
),
aggregated_data AS (
    SELECT page, query,
        SUM(clicks) as total_clicks,
        AVG(position) as avg_position,
        SUM(clicks) FILTER (WHERE period_flag = 1) as recent_clicks,
        AVG(position) FILTER (WHERE period_flag = 1) as recent_position,
        SUM(clicks) FILTER (WHERE period_flag = 2) as previous_clicks,
        AVG(position) FILTER (WHERE period_flag = 2) as previous_position,
        CASE WHEN AVG(position) BETWEEN 4 AND 10 THEN FLOOR(AVG(position))::INT ELSE NULL END as rank_bucket
    FROM base_data
    GROUP BY page, query
    HAVING SUM(clicks) > 0
),
page_stats AS (
    SELECT page,
        SUM(total_clicks) as page_total_clicks,
        COUNT(DISTINCT query) as total_keywords,
        COUNT(DISTINCT query) FILTER (WHERE rank_bucket IS NOT NULL) as keywords_4to10_count
    FROM aggregated_data
    GROUP BY page
),
current_best AS (
    SELECT DISTINCT ON (page) page, query as current_best_query,
        recent_clicks as current_best_clicks,
        recent_position as current_best_position
    FROM aggregated_data
    WHERE recent_clicks > 0
    ORDER BY page, recent_clicks DESC
),
previous_best AS (
    SELECT DISTINCT ON (page) page, query as prev_best_query,
        previous_clicks as prev_best_clicks,
        previous_position as prev_best_position
    FROM aggregated_data
    WHERE previous_clicks > 0
    ORDER BY page, previous_clicks DESC
),
keyword_groups AS (
    SELECT page, rank_bucket,
        STRING_AGG(query || '(' || total_clicks::text || ')', ', ' ORDER BY total_clicks DESC) as keywords
    FROM aggregated_data
    WHERE rank_bucket IS NOT NULL
    GROUP BY page, rank_bucket
),
keyword_pivot AS (
    SELECT page,
        MAX(CASE WHEN rank_bucket = 4 THEN keywords END) as rank_4,
        MAX(CASE WHEN rank_bucket = 5 THEN keywords END) as rank_5,
        MAX(CASE WHEN rank_bucket = 6 THEN keywords END) as rank_6,
        MAX(CASE WHEN rank_bucket = 7 THEN keywords END) as rank_7,
        MAX(CASE WHEN rank_bucket = 8 THEN keywords END) as rank_8,
        MAX(CASE WHEN rank_bucket = 9 THEN keywords END) as rank_9,
        MAX(CASE WHEN rank_bucket = 10 THEN keywords END) as rank_10
    FROM keyword_groups
    GROUP BY page
)
SELECT 
    ps.page,
    ps.page_total_clicks as total_clicks,
    cb.current_best_query as best_query,
    cb.current_best_clicks as best_query_clicks,
    ROUND(cb.current_best_position, 1) as best_query_position,
    CASE WHEN cb.current_best_query != pb.prev_best_query THEN '🔄 ' ELSE '' END || pb.prev_best_query as prev_best_query,
    pb.prev_best_clicks,
    ROUND(pb.prev_best_position, 1) as prev_best_position,
    CASE WHEN cb.current_best_query = pb.prev_best_query THEN (cb.current_best_clicks - COALESCE(pb.prev_best_clicks, 0))::text ELSE 'N/A' END as traffic_change,
    CASE WHEN cb.current_best_query = pb.prev_best_query AND pb.prev_best_position IS NOT NULL AND cb.current_best_position IS NOT NULL THEN ROUND(pb.prev_best_position - cb.current_best_position, 1)::text ELSE 'N/A' END as position_change,
    ps.keywords_4to10_count,
    ps.total_keywords,
    ROUND(ps.keywords_4to10_count::numeric * 100.0 / NULLIF(ps.total_keywords, 0), 1) || '%' as keywords_4to10_ratio,
    ROUND(ps.page_total_clicks * (CASE WHEN cb.current_best_position <= 4 THEN 0.7 ELSE 1.0 END + ps.keywords_4to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5)) as potential_traffic,
    CASE WHEN cb.current_best_position <= 4 THEN '0.7' ELSE '1.0' END as weight_factor,
    ROUND((CASE WHEN cb.current_best_position <= 4 THEN 0.7 ELSE 1.0 END + ps.keywords_4to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5 - 1) * 100, 1) || '%' as potential_increase_pct,
    kp.rank_4, kp.rank_5, kp.rank_6, kp.rank_7, kp.rank_8, kp.rank_9, kp.rank_10
FROM page_stats ps
INNER JOIN current_best cb ON ps.page = cb.page
LEFT JOIN previous_best pb ON ps.page = pb.page
LEFT JOIN keyword_pivot kp ON ps.page = kp.page
WHERE ps.page_total_clicks > 50
ORDER BY potential_traffic DESC NULLS LAST
LIMIT 100;`;
}
