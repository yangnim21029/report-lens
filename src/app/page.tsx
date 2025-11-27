"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { TaskPanel, type FlowStep, type StepStatus } from "../components/TaskPanel";

type Endpoint = {
  title: string;
  path: string;
  description: string;
  sample: string;
};

type ContextSuggestion = {
  before?: string;
  whyProblemNow?: string;
  adjustAsFollows?: string;
  afterAdjust?: string | null;
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

function deriveSiteFromUrl(url: string) {
  try {
    const u = new URL(url);
    return `sc-domain:${u.hostname.replace(/^www\./i, "")}`;
  } catch {
    return DEFAULT_SITE;
  }
}

function MindMapFlow({
  steps,
  onSelect,
  containerRef,
}: {
  steps: FlowStep[];
  onSelect: (step: FlowStep, target: HTMLElement) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
}) {
  const height = 340;
  const baseY = height / 2;
  const amplitude = 80;
  const spacing = 260;
  const nodeWidth = 240;
  const nodeHeight = 100;
  const nodes = steps.map((step, idx) => {
    const x = 120 + idx * spacing;
    const y = baseY + (idx % 2 === 0 ? -amplitude : amplitude);
    return { ...step, x, y };
  });

  const paths = nodes.slice(0, -1).map((node, idx) => {
    const next = nodes[idx + 1]!;
    const midX1 = node.x + spacing * 0.35;
    const midX2 = next.x - spacing * 0.35;
    const d = `M ${node.x} ${node.y} C ${midX1} ${node.y}, ${midX2} ${next.y}, ${next.x} ${next.y}`;
    const isComplete = node.status === "done" && next.status !== "pending";
    return { d, isComplete };
  });

  const statusStyles: Record<StepStatus, string> = {
    done: "ring-2 ring-sky-500 shadow-lg shadow-sky-100 border-sky-200 bg-white scale-[1.02]",
    active: "ring-2 ring-slate-300 border-slate-200 bg-white",
    pending: "border-slate-200 bg-white/80 text-slate-500",
  };

  const totalWidth = 80 + (steps.length - 1) * spacing + nodeWidth + 40;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-x-auto overflow-y-visible rounded-xl bg-white/70 px-4 py-6 ring-1 ring-slate-200"
    >
      <div className="relative" style={{ height, width: totalWidth }}>
        <svg
          width={totalWidth}
          height={height}
          viewBox={`0 0 ${totalWidth} ${height}`}
          preserveAspectRatio="xMinYMid meet"
          className="absolute inset-0"
        >
          {paths.map((p, i) => (
            <path
              key={`bg-${i}`}
              d={p.d}
              fill="none"
              stroke="#dfe5ef"
              strokeWidth={8}
              strokeLinecap="round"
            />
          ))}
          {paths.map((p, i) =>
            p.isComplete ? (
              <path
                key={`fg-${i}`}
                d={p.d}
                fill="none"
                stroke="url(#flowGradient)"
                strokeWidth={8}
                strokeLinecap="round"
              />
            ) : null,
          )}
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative" style={{ height, width: totalWidth }}>
          {nodes.map((node, idx) => (
            <div
              key={node.id}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:shadow-lg ${statusStyles[node.status]}`}
              style={{
                left: node.x,
                top: node.y,
                minWidth: nodeWidth,
                minHeight: nodeHeight,
              }}
              onClick={(e) => onSelect(node, e.currentTarget)}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl text-slate-500">
                <div className="h-6 w-6 rounded-full border border-slate-300" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {node.subtitle}
                </span>
                <span className="text-base font-bold text-slate-900">{node.title}</span>
              </div>
              {idx === nodes.length - 1 && (
                <span className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-sky-500 shadow" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



export default function ApiDocsPage() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const flowContainerRef = useRef<HTMLDivElement>(null);
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

  const [contextLoading, setContextLoading] = useState(false);
  const [contextMarkdown, setContextMarkdown] = useState<string | null>(null);
  const [contextSuggestions, setContextSuggestions] = useState<ContextSuggestion[]>([]);
  const [contextSearchRow, setContextSearchRow] = useState<any | null>(null);
  const [contextAnalyzeResult, setContextAnalyzeResult] = useState<any | null>(null);
  const [flowCurrent, setFlowCurrent] = useState<FlowStep["id"] | null>(null);
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const runRepostLensFlow = async () => {
    setContextLoading(true);
    setContextMarkdown(null);
    setContextSuggestions([]);
    setContextSearchRow(null);
    setContextAnalyzeResult(null);
    setFlowCurrent("search");
    try {
      const siteFromUrl = deriveSiteFromUrl(pageUrl);
      // Step 1: search/by-url
      const searchRes = await fetch("/api/search/by-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: siteFromUrl, page: pageUrl, startDate, periodDays }),
      });
      const searchJson = await searchRes.json().catch(() => null);
      if (!searchRes.ok) {
        throw new Error(searchJson?.error || `Search failed: ${searchRes.status}`);
      }
      if (!Array.isArray(searchJson) || !searchJson.length) {
        throw new Error("search/by-url 沒有回傳資料");
      }
      const pickedRow = searchJson[0];
      setContextSearchRow(pickedRow);

      // Step 2: optimize/analyze
      setFlowCurrent("analyze");
      const analyzePayload: Record<string, unknown> = {
        page: pageUrl,
        bestQuery: pickedRow.best_query,
        bestQueryClicks: pickedRow.best_query_clicks,
        bestQueryPosition: pickedRow.best_query_position,
      };
      const analyzeRes = await fetch("/api/optimize/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(analyzePayload),
      });
      const analyzeJson = await analyzeRes.json().catch(() => null);
      if (!analyzeRes.ok || analyzeJson?.success === false) {
        throw new Error(analyzeJson?.error || `Analyze failed: ${analyzeRes.status}`);
      }
      setContextAnalyzeResult(analyzeJson);
      const analysisText =
        typeof analyzeJson?.analysis === "string" && analyzeJson.analysis.trim()
          ? analyzeJson.analysis
          : "";

      // Step 3: context-vector
      setFlowCurrent("context");
      const contextRes = await fetch("/api/report/context-vector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisText,
          pageUrl,
        }),
      });
      const contextJson = await contextRes.json().catch(() => null);
      if (!contextRes.ok || contextJson?.success === false) {
        throw new Error(contextJson?.error || `Context-vector failed: ${contextRes.status}`);
      }
      setContextMarkdown(typeof contextJson?.markdown === "string" ? contextJson.markdown : null);
      setContextSuggestions(Array.isArray(contextJson?.suggestions) ? contextJson.suggestions : []);
    } catch (err) {
      // Swallow error; flow state will remain on the step that failed
    } finally {
      setContextLoading(false);
      setFlowCurrent(null);
    }
  };

  const firstRow = useMemo(
    () => (Array.isArray(searchResult) && searchResult.length ? searchResult[0] : null),
    [searchResult],
  );

  const endpoints = useMemo(() => buildEndpoints(baseUrl), [baseUrl]);
  const flowSteps = useMemo<FlowStep[]>(() => {
    const hasSearch =
      (Array.isArray(searchResult) && searchResult.length > 0) || !!contextSearchRow;
    const hasAnalyze = !!analyzeResult || !!contextAnalyzeResult;
    const hasContext = !!contextMarkdown || (contextSuggestions?.length ?? 0) > 0;
    const tasks = {
      start: [
        { id: "prep", title: "確認網址", desc: "輸入並檢查 page URL 及站點。" },
        { id: "ready", title: "載入預設", desc: "預設填入 holidaysmart 範例便於測試。" },
      ],
      search: [
        { id: "call", title: "呼叫 /api/search/by-url", desc: "傳入 site + page + startDate/periodDays 取得 GSC 行為資料。" },
        {
          id: "parse",
          title: "解析結果",
          desc: "預設取回陣列第 1 筆（含 best_query、rank buckets、clicks/impressions），可改為手動挑選。",
        },
      ],
      analyze: [
        { id: "fetch", title: "抓取文章 HTML", desc: "以 UA=RepostLens 取得主文並轉純文本。" },
        {
          id: "build",
          title: "組合分析 Prompt",
          desc: "把 Rank1-10 + SV、前次排名快照、Coverage/Explorer/PAA 摘要一次丟進同一個 prompt，讓模型排序關鍵字優先度、挑薄弱區塊，並輸出 analysis（例如 Search Characteristic / Semantic Hijacking / Implementation Priority 的 Markdown 區塊），不含插入 anchor。",
        },
        { id: "call", title: "呼叫 /api/optimize/analyze", desc: "單次模型輸出 analysis 與零搜尋字檢查。" },
      ],
      context: [
        {
          id: "prompt",
          title: "組合 Context Vector Prompt",
          desc: "在這步要求輸出 schema：before=原文中 10+ 字且全文唯一的片段作 anchor（例如「屯門站至紅磡小巴 40X 時間表」）、whyProblemNow=為何補、adjustAsFollows=要補的訊息＋口吻/長度＋插在 before 後、afterAdjust=完成段落。這組欄位對應 context-vector API 的輸出格式，用 before 當定位點，其餘三欄給原因、指令與成品。",
        },
        { id: "call", title: "呼叫 /api/report/context-vector", desc: "Structured output 回傳 before/after 建議與 Markdown 表格。" },
      ],
    };
    return [
      { id: "start", title: "Start", subtitle: "準備", status: "done", tasks: tasks.start },
      {
        id: "search",
        title: "Search by URL",
        subtitle: hasSearch ? "完成" : "抓取頁面表現",
        status: hasSearch ? "done" : flowCurrent === "search" ? "active" : "pending",
        tasks: tasks.search,
      },
      {
        id: "analyze",
        title: "Optimize / Analyze",
        subtitle: hasAnalyze ? "完成" : "語意分析",
        status: hasAnalyze
          ? "done"
          : flowCurrent === "analyze"
            ? "active"
            : hasSearch
              ? "active"
              : "pending",
        tasks: tasks.analyze,
      },
      {
        id: "context",
        title: "Context Vector",
        subtitle: hasContext ? "完成" : "插段建議",
        status: hasContext
          ? "done"
          : flowCurrent === "context"
            ? "active"
            : hasAnalyze
              ? "active"
              : "pending",
        tasks: tasks.context,
      },
    ];
  }, [
    searchResult,
    analyzeResult,
    contextMarkdown,
    contextSuggestions,
    contextSearchRow,
    contextAnalyzeResult,
    flowCurrent,
  ]);

  // 自動選擇目前進行或最後完成的節點
  useEffect(() => {
    if (selectedStep) return;
    const pick =
      flowSteps.find((s) => s.status === "active") ||
      [...flowSteps].reverse().find((s) => s.status === "done") ||
      flowSteps[0];
    if (pick) setSelectedStep(pick);
  }, [flowSteps, selectedStep]);

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
        rank1: firstRow.current_rank_1,
        rank2: firstRow.current_rank_2,
        rank3: firstRow.current_rank_3,
        rank4: firstRow.current_rank_4,
        rank5: firstRow.current_rank_5,
        rank6: firstRow.current_rank_6,
        rank7: firstRow.current_rank_7,
        rank8: firstRow.current_rank_8,
        rank9: firstRow.current_rank_9,
        rank10: firstRow.current_rank_10,
        prevRank1: firstRow.prev_rank_1,
        prevRank2: firstRow.prev_rank_2,
        prevRank3: firstRow.prev_rank_3,
        prevRank4: firstRow.prev_rank_4,
        prevRank5: firstRow.prev_rank_5,
        prevRank6: firstRow.prev_rank_6,
        prevRank7: firstRow.prev_rank_7,
        prevRank8: firstRow.prev_rank_8,
        prevRank9: firstRow.prev_rank_9,
        prevRank10: firstRow.prev_rank_10,
        prevRankGt10: firstRow.prev_rank_gt10,
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

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">語意分析 Flow（XMind 風格）</h2>
              <p className="text-sm text-slate-600">
                節點代表 API 步驟，採用 Zig-Zag S 型曲線串連。完成前一步後，導管顏色會向下一步流動。
              </p>
            </div>
            <button
              onClick={runRepostLensFlow}
              disabled={contextLoading}
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {contextLoading ? "Running..." : "執行流程"}
            </button>
          </div>
          <MindMapFlow
            steps={flowSteps}
            onSelect={(step, target) => {
              setSelectedStep(step);
              setAnchorEl(target);
            }}
            containerRef={flowContainerRef}
          />
          <TaskPanel
            step={selectedStep}
            anchorEl={anchorEl}
            containerRef={flowContainerRef}
            onClose={() => setAnchorEl(null)}
          />
        </section>

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
