import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

const searchResultSchema = z.object({
  page: z.string(),
  total_clicks: z.number().nullable(),
  best_query: z.string().nullable(),
  best_query_clicks: z.number().nullable(),
  best_query_position: z.number().nullable(),
  // 前期數據
  prev_best_query: z.string().nullable(),
  prev_best_clicks: z.number().nullable(),
  prev_best_position: z.number().nullable(),
  traffic_change: z.string().nullable(),
  position_change: z.string().nullable(),
  // 統計數據
  keywords_4to10_count: z.number().nullable(),
  total_keywords: z.number().nullable(),
  keywords_4to10_ratio: z.string().nullable(),
  potential_traffic: z.number().nullable(),
  weight_factor: z.string().nullable(),
  potential_increase_pct: z.string().nullable(),
  // 排名分布
  rank_4: z.string().nullable(),
  rank_5: z.string().nullable(),
  rank_6: z.string().nullable(),
  rank_7: z.string().nullable(),
  rank_8: z.string().nullable(),
  rank_9: z.string().nullable(),
  rank_10: z.string().nullable()
});

type SearchResult = z.infer<typeof searchResultSchema>;

export const searchRouter = createTRPCRouter({
  getSearchData: publicProcedure
    .input(
      z.object({
        site: z.string().default('sc-domain:holidaysmart.io')
      })
    )
    .query(async ({ input }) => {
      const sql = `-- 日期設定區
WITH date_settings AS (
    SELECT 
        CURRENT_DATE - INTERVAL '7 days' as current_period_start,
        CURRENT_DATE as current_period_end,
        CURRENT_DATE - INTERVAL '14 days' as previous_period_start,
        CURRENT_DATE - INTERVAL '7 days' as previous_period_end,
        CURRENT_DATE - INTERVAL '14 days' as total_period_start
),

-- 步驟 1: 基礎數據準備（單次掃描）
base_data AS (
    SELECT 
        page,
        query,
        clicks,
        position,
        date::DATE as date,
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
            SELECT page 
            FROM {site}
            CROSS JOIN date_settings ds2
            WHERE date::DATE >= ds2.total_period_start
            GROUP BY page
            HAVING SUM(clicks) > 50
        )
),

-- 步驟 2: 聚合數據
aggregated_data AS (
    SELECT 
        page,
        query,
        SUM(clicks) as total_clicks,
        AVG(position) as avg_position,
        SUM(clicks) FILTER (WHERE period_flag = 1) as recent_clicks,
        AVG(position) FILTER (WHERE period_flag = 1) as recent_position,
        SUM(clicks) FILTER (WHERE period_flag = 2) as previous_clicks,
        AVG(position) FILTER (WHERE period_flag = 2) as previous_position,
        CASE 
            WHEN AVG(position) BETWEEN 4 AND 10 THEN 
                FLOOR(AVG(position))::INT
            ELSE NULL
        END as rank_bucket
    FROM base_data
    GROUP BY page, query
    HAVING SUM(clicks) > 0
),

-- 步驟 3: 頁面統計
page_stats AS (
    SELECT 
        page,
        SUM(total_clicks) as page_total_clicks,
        COUNT(DISTINCT query) as total_keywords,
        COUNT(DISTINCT query) FILTER (WHERE rank_bucket IS NOT NULL) as keywords_4to10_count
    FROM aggregated_data
    GROUP BY page
),

-- 步驟 4: 當前期最佳查詢
current_best AS (
    SELECT DISTINCT ON (page)
        page,
        query as current_best_query,
        recent_clicks as current_best_clicks,
        recent_position as current_best_position
    FROM aggregated_data
    WHERE recent_clicks > 0
    ORDER BY page, recent_clicks DESC
),

-- 步驟 5: 前期最佳查詢
previous_best AS (
    SELECT DISTINCT ON (page)
        page,
        query as prev_best_query,
        previous_clicks as prev_best_clicks,
        previous_position as prev_best_position
    FROM aggregated_data
    WHERE previous_clicks > 0
    ORDER BY page, previous_clicks DESC
),

-- 步驟 6: 關鍵字分組
keyword_groups AS (
    SELECT 
        page,
        rank_bucket,
        STRING_AGG(
            query || '(' || total_clicks::text || ')',
            ', '
            ORDER BY total_clicks DESC
        ) as keywords
    FROM aggregated_data
    WHERE rank_bucket IS NOT NULL
    GROUP BY page, rank_bucket
),

-- 步驟 7: 關鍵字透視
keyword_pivot AS (
    SELECT 
        page,
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

-- 最終輸出
SELECT 
    ps.page,
    ps.page_total_clicks as total_clicks,
    cb.current_best_query as best_query,
    cb.current_best_clicks as best_query_clicks,
    ROUND(cb.current_best_position, 1) as best_query_position,
    
    CASE 
        WHEN cb.current_best_query != pb.prev_best_query THEN '🔄 ' 
        ELSE '' 
    END || pb.prev_best_query as prev_best_query,
    pb.prev_best_clicks,
    ROUND(pb.prev_best_position, 1) as prev_best_position,
    
    CASE 
        WHEN cb.current_best_query = pb.prev_best_query 
        THEN (cb.current_best_clicks - COALESCE(pb.prev_best_clicks, 0))::text
        ELSE 'N/A'
    END as traffic_change,
    
    CASE 
        WHEN cb.current_best_query = pb.prev_best_query 
             AND pb.prev_best_position IS NOT NULL
             AND cb.current_best_position IS NOT NULL
        THEN ROUND(pb.prev_best_position - cb.current_best_position, 1)::text
        ELSE 'N/A'
    END as position_change,
    
    ps.keywords_4to10_count,
    ps.total_keywords,
    ROUND(
        ps.keywords_4to10_count::numeric * 100.0 / NULLIF(ps.total_keywords, 0), 
        1
    ) || '%' as keywords_4to10_ratio,
    
    -- 改進的 potential_traffic 計算
    -- 考慮主詞排名：1-4名給予較低權重(0.7)，5名以後給予標準權重(1.0)
    ROUND(
        ps.page_total_clicks * 
        (CASE 
            WHEN cb.current_best_position <= 4 THEN 0.7  -- 主詞已在前4名，優化潛力較小
            ELSE 1.0                                       -- 主詞在5名以後，優化潛力較大
        END 
        + ps.keywords_4to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5)
    ) as potential_traffic,
    
    -- 新增：顯示權重係數，方便理解計算邏輯
    CASE 
        WHEN cb.current_best_position <= 4 THEN '0.7'
        ELSE '1.0'
    END as weight_factor,
    
    -- 新增：實際的潛力提升比例
    ROUND(
        (CASE 
            WHEN cb.current_best_position <= 4 THEN 0.7
            ELSE 1.0
        END 
        + ps.keywords_4to10_count::numeric / GREATEST(ps.total_keywords, 1) * 0.5 - 1) * 100,
        1
    ) || '%' as potential_increase_pct,
    
    -- 排名分布
    kp.rank_4, kp.rank_5, kp.rank_6, kp.rank_7,
    kp.rank_8, kp.rank_9, kp.rank_10
FROM page_stats ps
INNER JOIN current_best cb ON ps.page = cb.page
LEFT JOIN previous_best pb ON ps.page = pb.page
LEFT JOIN keyword_pivot kp ON ps.page = kp.page
WHERE ps.page_total_clicks > 50
ORDER BY potential_traffic DESC NULLS LAST
LIMIT 100;`;

      try {
        const response = await fetch(
          'https://unbiased-remarkably-arachnid.ngrok-free.app/api/query',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
              site: input.site,
              sql: sql
            })
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', JSON.stringify(data, null, 2));

        // Check if data is an array, if not try to extract it
        let resultArray: SearchResult[] = [];

        if (Array.isArray(data)) {
          resultArray = data;
        } else if (data && typeof data === 'object') {
          // Try common response patterns
          if (data.data && Array.isArray(data.data)) {
            resultArray = data.data;
          } else if (data.results && Array.isArray(data.results)) {
            resultArray = data.results;
          } else if (data.rows && Array.isArray(data.rows)) {
            resultArray = data.rows;
          } else {
            console.warn('Unexpected response format, returning empty array');
            resultArray = [];
          }
        }

        return resultArray;
      } catch (error) {
        console.error('Error fetching search data:', error);
        throw new Error('Failed to fetch search data');
      }
    })
});