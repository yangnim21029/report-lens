/**
 * Utility Functions
 * Helper functions used across the application
 */

import type { Endpoint } from "~/types";
import { DEFAULT_SITE } from "~/config";

/**
 * Pretty print JSON objects
 */
export function pretty(obj: unknown): string {
    if (obj === null || obj === undefined) return "";
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

/**
 * Derive site token from URL
 */
export function deriveSiteFromUrl(url: string): string {
    try {
        const u = new URL(url);
        return `sc-domain:${u.hostname.replace(/^www\./i, "")}`;
    } catch {
        return DEFAULT_SITE;
    }
}

/**
 * Sanitize text segment (remove extra whitespace)
 */
export function sanitizeSegment(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim();
}

/**
 * Build API endpoint documentation
 */
export function buildEndpoints(baseUrl: string): Endpoint[] {
    const origin = baseUrl.replace(/\/$/, "");
    return [
        {
            title: "站點清單",
            path: "GET /api/sites",
            description: "向上游 GSC DB 取得可用的 site token 陣列（無參數）。",
            sample: `curl -sS '${origin}/api/sites' | jq`,
        },
        {
            title: "站內列表查詢",
            path: "POST /api/search/list",
            description: "輸入 site，回傳該站過去 30 天（含 MoM）聚合的頁面表現。",
            sample: `curl -sS '${origin}/api/search/list' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"site":"sc-domain:holidaysmart.io"}' | jq '.[0]'`,
        },
        {
            title: "單頁查詢",
            path: "POST /api/search/by-url",
            description:
                "輸入 site + page，支援 startDate (YYYY-MM-DD) 與 periodDays，預設近 14 天。",
            sample: `curl -sS '${origin}/api/search/by-url' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"site":"sc-domain:holidaysmart.io","page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80","startDate":"2024-01-01","periodDays":14}' | jq`,
        },
        {
            title: "語意分析",
            path: "POST /api/optimize/analyze",
            description:
                "輸入 page 及 keyword stats（best_query、rank1~10 等），回傳 sections.quickWins / structuralChanges / rawAnalysis。",
            sample: `curl -sS '${origin}/api/optimize/analyze' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"page":"https://example.com/foo","bestQuery":"關鍵字","bestQueryClicks":120,"bestQueryPosition":5.2}' | jq '.sections'`,
        },
        {
            title: "Meta 標題提案",
            path: "POST /api/metatag",
            description:
                "輸入 site + page (+ topic/ctrBenchmark/startDate/periodDays)，會先呼叫 by-url 拉資料，再用 OpenAI 產生標題建議與目標關鍵字。",
            sample: `curl -sS '${origin}/api/metatag' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"site":"sc-domain:holidaysmart.io","page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80","topic":"主題"}' | jq '{success, targetKeyword, report}'`,
        },
        {
            title: "Context Vector",
            path: "POST /api/report/context-vector",
            description:
                "輸入分析文字 + pageUrl，輸出 markdown 表格（原文片段 vs 建議調整）。",
            sample: `curl -sS '${origin}/api/report/context-vector' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"analysisText":"<analysis text>","pageUrl":"https://example.com"}' | jq`,
        },
    ];
}
