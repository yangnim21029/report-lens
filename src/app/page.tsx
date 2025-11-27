"use client";

import { useEffect, useMemo, useState } from "react";

type Endpoint = {
  title: string;
  path: string;
  description: string;
  sample: string;
};

const DEFAULT_SITE = "sc-domain:holidaysmart.io";
const DEFAULT_PAGE =
  "https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80";
const DEFAULT_BASE_URL = "http://localhost:3000";

function buildEndpoints(baseUrl: string): Endpoint[] {
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
      sample: `curl -sS '${origin}/api/search/list' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"site\":\"sc-domain:holidaysmart.io\"}' | jq '.[0]'`,
    },
    {
      title: "單頁查詢",
      path: "POST /api/search/by-url",
      description:
        "輸入 site + page，支援 startDate (YYYY-MM-DD) 與 periodDays，預設近 14 天。",
      sample: `curl -sS '${origin}/api/search/by-url' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"site\":\"sc-domain:holidaysmart.io\",\"page\":\"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80\",\"startDate\":\"2024-01-01\",\"periodDays\":14}' | jq`,
    },
    {
      title: "語意分析",
      path: "POST /api/optimize/analyze",
      description:
        "輸入 page 及 keyword stats（best_query、rank1~10 等），回傳 sections.quickWins / structuralChanges / rawAnalysis。",
      sample: `curl -sS '${origin}/api/optimize/analyze' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"page\":\"https://example.com/foo\",\"bestQuery\":\"關鍵字\",\"bestQueryClicks\":120,\"bestQueryPosition\":5.2}' | jq '.sections'`,
    },
    {
      title: "Meta 標題提案",
      path: "POST /api/metatag",
      description:
        "輸入 site + page (+ topic/ctrBenchmark/startDate/periodDays)，會先呼叫 by-url 拉資料，再用 OpenAI 產生標題建議與目標關鍵字。",
      sample: `curl -sS '${origin}/api/metatag' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"site\":\"sc-domain:holidaysmart.io\",\"page\":\"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80\",\"topic\":\"主題\"}' | jq '{success, targetKeyword, report}'`,
    },
    {
      title: "Context Vector",
      path: "POST /api/report/context-vector",
      description:
        "輸入分析文字 + pageUrl，輸出 markdown 表格（原文片段 vs 建議調整）。",
      sample: `curl -sS '${origin}/api/report/context-vector' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"analysisText\":\"<analysis text>\",\"pageUrl\":\"https://example.com\"}' | jq`,
    },
  ];
}

function getDefaultStartDate() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 14);
  return start.toISOString().split("T")[0]!;
}

function pretty(obj: unknown) {
  if (obj === null || obj === undefined) return "";
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function ApiDocsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [site, setSite] = useState(DEFAULT_SITE);
  const [pageUrl, setPageUrl] = useState(DEFAULT_PAGE);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [periodDays, setPeriodDays] = useState(14);
  const [endpointStates, setEndpointStates] = useState<
    Record<
      string,
      {
        loading: boolean;
        data: unknown;
        error: string | null;
      }
    >
  >({});

  const [searchResult, setSearchResult] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [analyzeResult, setAnalyzeResult] = useState<any | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const firstRow = useMemo(
    () => (Array.isArray(searchResult) && searchResult.length ? searchResult[0] : null),
    [searchResult],
  );

  const endpoints = useMemo(() => buildEndpoints(baseUrl), [baseUrl]);

  const handleSearch = async () => {
    setSearchLoading(true);
    setSearchError(null);
    setAnalyzeResult(null);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/search/by-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site, page: pageUrl, startDate, periodDays }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `Search failed: ${res.status}`);
      }
      if (!Array.isArray(json)) {
        throw new Error("Unexpected response shape (expected array).");
      }
      setSearchResult(json);
    } catch (err) {
      setSearchResult(null);
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!firstRow) {
      setAnalyzeError("請先跑單頁查詢，才能傳遞資料給 /api/optimize/analyze。");
      return;
    }
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    try {
      const payload: Record<string, unknown> = {
        page: pageUrl,
        bestQuery: firstRow.best_query,
        bestQueryClicks: firstRow.best_query_clicks,
        bestQueryPosition: firstRow.best_query_position,
      };
      const res = await fetch("/api/optimize/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `Analyze failed: ${res.status}`);
      }
      setAnalyzeResult(json);
    } catch (err) {
      setAnalyzeResult(null);
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const runEndpoint = async (ep: Endpoint) => {
    setEndpointStates((prev) => ({
      ...prev,
      [ep.path]: { loading: true, data: prev[ep.path]?.data ?? null, error: null },
    }));

    try {
      let res: Response;
      switch (ep.path) {
        case "GET /api/sites": {
          res = await fetch("/api/sites");
          break;
        }
        case "POST /api/search/list": {
          res = await fetch("/api/search/list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ site }),
          });
          break;
        }
        case "POST /api/search/by-url": {
          res = await fetch("/api/search/by-url", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ site, page: pageUrl, startDate, periodDays }),
          });
          break;
        }
        case "POST /api/optimize/analyze": {
          if (!firstRow) {
            throw new Error("請先跑單頁查詢（by-url），才能帶入 best_query。");
          }
          const payload: Record<string, unknown> = {
            page: pageUrl,
            bestQuery: firstRow.best_query,
            bestQueryClicks: firstRow.best_query_clicks,
            bestQueryPosition: firstRow.best_query_position,
          };
          res = await fetch("/api/optimize/analyze", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          break;
        }
        case "POST /api/metatag": {
          res = await fetch("/api/metatag", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              site,
              page: pageUrl,
              topic: "主題",
              startDate,
              periodDays,
            }),
          });
          break;
        }
        case "POST /api/report/context-vector": {
          const fallbackAnalysis =
            analyzeResult?.sections?.rawAnalysis ||
            "Sample analysis text: keep intro concise, add bullet list with key facts.";
          res = await fetch("/api/report/context-vector", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              analysisText: fallbackAnalysis,
              pageUrl: pageUrl || "https://example.com",
            }),
          });
          break;
        }
        default:
          throw new Error("未支援的端點");
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `Request failed: ${res.status}`);
      }

      setEndpointStates((prev) => ({
        ...prev,
        [ep.path]: { loading: false, data: json, error: null },
      }));
    } catch (err) {
      setEndpointStates((prev) => ({
        ...prev,
        [ep.path]: {
          loading: false,
          data: prev[ep.path]?.data ?? null,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase text-indigo-600">RepostLens API</p>
          <h1 className="text-3xl font-black tracking-tight">可操作 UI（測試用）</h1>
          <p className="text-slate-600">
            直接用預設的 holidaysmart 範例測試 by-url 與 analyze。若要換頁面，可修改欄位後重跑。
          </p>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold text-slate-700">
              Site
              <input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex-1 text-sm font-semibold text-slate-700">
              Page URL
              <input
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-sm font-semibold text-slate-700">
              Start Date (YYYY-MM-DD)
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Period Days
              <input
                type="number"
                value={periodDays}
                min={1}
                onChange={(e) => setPeriodDays(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="h-[42px] rounded bg-indigo-600 px-4 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searchLoading ? "Running..." : "Run /api/search/by-url"}
            </button>
          </div>

          {searchError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {searchError}
            </div>
          )}

          {Array.isArray(searchResult) && (
            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  回傳 {searchResult.length} 筆；下方顯示完整 JSON
                </p>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-50">
                {pretty(searchResult)}
              </pre>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">語意分析（用第一筆結果）</h2>
              <p className="text-sm text-slate-600">
                按鈕會帶入第一筆 best_query / clicks / position。
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!firstRow || analyzeLoading}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analyzeLoading ? "Analyzing..." : "Run /api/optimize/analyze"}
            </button>
          </div>
          {!firstRow && (
            <p className="text-sm text-slate-500">請先跑單頁查詢，會自動取第一筆。</p>
          )}
          {analyzeError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {analyzeError}
            </div>
          )}
          {analyzeResult && (
            <pre className="max-h-[360px] overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-50">
              {pretty(analyzeResult)}
            </pre>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-4">
          <h2 className="text-xl font-bold">核心 API（參考用）</h2>
          <p className="text-sm text-slate-600">仍保留完整 REST 端點，可直接複製 curl。</p>
          <div className="space-y-6">
            {endpoints.map((ep) => (
              <div key={ep.title} className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-semibold uppercase text-indigo-600">
                    {ep.path}
                  </div>
                  <h3 className="text-lg font-bold">{ep.title}</h3>
                  <p className="text-sm text-slate-700">{ep.description}</p>
                </div>
                <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-4 text-xs text-slate-50">
                  <code>{ep.sample}</code>
                </pre>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => runEndpoint(ep)}
                      disabled={endpointStates[ep.path]?.loading}
                      className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {endpointStates[ep.path]?.loading
                        ? "Running..."
                        : `Run ${ep.path.split(" ")[1] ?? ""}`}
                    </button>
                    {endpointStates[ep.path]?.error && (
                      <span className="text-sm text-red-600">
                        {endpointStates[ep.path]?.error}
                      </span>
                    )}
                  </div>
                  {endpointStates[ep.path]?.data !== undefined &&
                    endpointStates[ep.path]?.data !== null && (
                      <pre className="overflow-x-auto rounded bg-white p-3 text-xs text-slate-900 ring-1 ring-slate-200">
                        {pretty(endpointStates[ep.path]?.data)}
                      </pre>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
