"use client";

import { memo, useCallback, useRef, useState } from "react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { DataCardActions } from "~/components/DataCardActions";
import { KeywordInsightsPanel } from "~/components/KeywordInsightsPanel";
import {
  collectAllCurrentRows,
  normalizeKeyword,
  parseBucket,
} from "~/components/data-card-helpers";
import { buildEmailHtml } from "~/utils/email-builder";
import { extractAnalysisData, formatAsMarkdown } from "~/utils/extract-format-html";
// Use server API route to avoid CORS / ngrok HTML warning

type ContextVectorApiSuggestion = {
  before?: string;
  whyProblemNow?: string;
  adjustAsFollows?: string;
};

type ContextVectorApiResponse = {
  markdown?: string | null;
  suggestions?: ContextVectorApiSuggestion[];
};

interface DataCardProps {
  data: any;
  onModalChange?: (isOpen: boolean) => void;
  site?: string;
  startDate?: string;
  periodDays?: number;
  ctrBenchmark?: number;
}

type MetaGenerationResult = {
  report: string;
  targetKeyword?: {
    keyword: string;
    ctr: number | null;
    impressions: number | null;
    searchVolume?: number | null;
  } | null;
  prompt?: string;
};

function selectContextVectorMarkdown(response: ContextVectorApiResponse): string {
  if (response && typeof response.markdown === "string" && response.markdown.trim()) {
    return response.markdown.trim();
  }
  const suggestions = Array.isArray(response?.suggestions) ? response?.suggestions ?? [] : [];
  if (!suggestions.length) {
    return "| 原文片段 | 建議調整 |\n|:---|:---|\n| 目前無需調整 | — |";
  }
  const header = "| 原文片段 | 建議調整 |";
  const divider = "|:---|:---|";
  const rows = suggestions
    .map((item) => ({
      before: sanitizeSegment(item.before),
      why: sanitizeSegment(item.whyProblemNow, "Why problem now:"),
      adjust: sanitizeSegment(item.adjustAsFollows, "Adjust as follows:"),
    }))
    .filter((item) => item.before && item.why && item.adjust)
    .map((item) => {
      const right = `${item.why}\n${item.adjust}`.trim();
      return `| ${escapePipes(item.before)} | ${escapePipes(right)} |`;
    });
  if (!rows.length) {
    return "| 原文片段 | 建議調整 |\n|:---|:---|\n| 目前無需調整 | — |";
  }
  return [header, divider, ...rows].join("\n");
}

function sanitizeSegment(value: unknown, prefix?: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || !prefix) return trimmed;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return trimmed;
  return `${prefix} ${trimmed}`.replace(/\s+/g, " ");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function formatNumberDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric).toLocaleString();
}

export const DataCard = memo(function DataCard({
  data,
  onModalChange,
  site,
  startDate,
  periodDays,
  ctrBenchmark,
}: DataCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [contextVector, setContextVector] = useState<string | null>(null);
  const [contextVectorError, setContextVectorError] = useState<string | null>(null);
  const contextVectorPromiseRef = useRef<Promise<string> | null>(null);
  const [metaResult, setMetaResult] = useState<MetaGenerationResult | null>(null);
  const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaCopied, setMetaCopied] = useState(false);
  const [metaPromptCopied, setMetaPromptCopied] = useState(false);
  const [outline, setOutline] = useState<string | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const outlinePromiseRef = useRef<Promise<string> | null>(null);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [svMap, setSvMap] = useState<Record<string, number | null>>({});
  const [isFetchingSV, setIsFetchingSV] = useState(false);
  const [svError, setSvError] = useState<string | null>(null);
  const [potentialKeywords, setPotentialKeywords] = useState<
    { keyword: string; searchVolume: number | null; clicks: number | null }[]
  >([]);
  const [hasFetchedCoverage, setHasFetchedCoverage] = useState(false);
  const [showPotential, setShowPotential] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [compareMode, setCompareMode] = useState(true);
  const [isFetchingExplorer, setIsFetchingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerInsights, setExplorerInsights] = useState<any | null>(null);
  const [explorerShowAll, setExplorerShowAll] = useState(false);

  const CTR_FULL_SCORE = 39.8;
  const pageUrl = typeof data?.page === "string" ? data.page : "";
  const topicCandidate = typeof data?.best_query === "string" ? data.best_query.trim() : "";
  const canGenerateMeta = Boolean(site && pageUrl);
  const metaCtrBenchmark = typeof ctrBenchmark === "number" && Number.isFinite(ctrBenchmark) ? ctrBenchmark : CTR_FULL_SCORE;

  const handleAnalyze = useCallback(() => {
    const run = async () => {
      if (hasAnalyzed || isLoading) return;
      setHasAnalyzed(true);
      setIsLoading(true);
      setError(null);
      setContextVector(null);
      setContextVectorError(null);
      contextVectorPromiseRef.current = null;
      setOutline(null);
      setOutlineError(null);
      outlinePromiseRef.current = null;
      try {
        const res = await fetch("/api/optimize/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: data.page,
            bestQuery: data.best_query,
            bestQueryClicks: data.best_query_clicks,
            bestQueryPosition: data.best_query_position,
            // API payload kept for compatibility; map to new fields
            prevBestQuery: data.prev_main_keyword,
            prevBestPosition: data.prev_keyword_rank,
            prevBestClicks: data.prev_keyword_traffic,
            rank1: (data as any)?.current_rank_1,
            rank2: (data as any)?.current_rank_2,
            rank3: (data as any)?.current_rank_3,
            rank4: (data as any)?.current_rank_4,
            rank5: (data as any)?.current_rank_5,
            rank6: (data as any)?.current_rank_6,
            rank7: (data as any)?.current_rank_7,
            rank8: (data as any)?.current_rank_8,
            rank9: (data as any)?.current_rank_9,
            rank10: (data as any)?.current_rank_10,
            prevRank1: (data as any)?.prev_rank_1,
            prevRank2: (data as any)?.prev_rank_2,
            prevRank3: (data as any)?.prev_rank_3,
            prevRank4: (data as any)?.prev_rank_4,
            prevRank5: (data as any)?.prev_rank_5,
            prevRank6: (data as any)?.prev_rank_6,
            prevRank7: (data as any)?.prev_rank_7,
            prevRank8: (data as any)?.prev_rank_8,
            prevRank9: (data as any)?.prev_rank_9,
            prevRank10: (data as any)?.prev_rank_10,
            prevRankGt10: (data as any)?.prev_rank_gt10,
          }),
        });
        if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
        setAnalysis(await res.json());
      } catch (e: any) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsLoading(false);
      }
    };
    run();
    if (!isExpanded) {
      setIsExpanded(true);
      onModalChange?.(true);
    }
  }, [hasAnalyzed, isLoading, data, isExpanded, onModalChange]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    onModalChange?.(false);
  }, [onModalChange]);

  const handleSendToChat = useCallback(() => {
    alert("Chat integration removed in REST migration");
  }, []);

  const handleGenerateMeta = useCallback(async () => {
    if (!canGenerateMeta || !site || !pageUrl) {
      setMetaError("缺少 site 或 page 資料，無法生成標題提案。");
      return;
    }
    setIsGeneratingMeta(true);
    setMetaError(null);
    try {
      const payload: Record<string, unknown> = {
        site,
        page: pageUrl,
        ctrBenchmark: metaCtrBenchmark,
      };
      if (topicCandidate) payload.topic = topicCandidate;
      if (startDate) payload.startDate = startDate;
      if (typeof periodDays === "number" && Number.isFinite(periodDays)) payload.periodDays = periodDays;

      const response = await fetch("/api/metatag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        const detail = json?.error || `Meta generation failed: ${response.status}`;
        throw new Error(detail);
      }

      const report = typeof json.report === "string" ? json.report.trim() : "";
      if (!report) {
        throw new Error("Meta generation returned empty report");
      }

      const rawTarget = json?.targetKeyword;
      const keywordText = rawTarget && typeof rawTarget === "object" ? String(rawTarget.keyword ?? "").trim() : "";
      const targetKeyword = keywordText
        ? {
            keyword: keywordText,
            ctr: typeof rawTarget.ctr === "number" && Number.isFinite(rawTarget.ctr) ? rawTarget.ctr : null,
            impressions: typeof rawTarget.impressions === "number" && Number.isFinite(rawTarget.impressions)
              ? rawTarget.impressions
              : null,
            searchVolume: typeof rawTarget.searchVolume === "number" && Number.isFinite(rawTarget.searchVolume)
              ? rawTarget.searchVolume
              : null,
          }
        : null;

      setMetaResult({
        report,
        targetKeyword,
        prompt: typeof json.prompt === "string" ? json.prompt : undefined,
      });
      setMetaCopied(false);
      setMetaPromptCopied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMetaError(message);
      setMetaResult(null);
      setMetaCopied(false);
      setMetaPromptCopied(false);
      console.error("[DataCard] meta generation failed", err);
    } finally {
      setIsGeneratingMeta(false);
    }
  }, [canGenerateMeta, site, pageUrl, metaCtrBenchmark, topicCandidate, startDate, periodDays]);

  const handleCopyMeta = useCallback(async () => {
    if (!metaResult?.report) return;
    try {
      await navigator.clipboard.writeText(metaResult.report);
      setMetaCopied(true);
      setTimeout(() => setMetaCopied(false), 1800);
    } catch (err) {
      console.error("[DataCard] copy meta report failed", err);
      alert("複製內容失敗，請手動複製。");
    }
  }, [metaResult]);

  const handleCopyPrompt = useCallback(async () => {
    if (!metaResult?.prompt) return;
    try {
      await navigator.clipboard.writeText(metaResult.prompt);
      setMetaPromptCopied(true);
      setTimeout(() => setMetaPromptCopied(false), 1800);
    } catch (err) {
      console.error("[DataCard] copy prompt failed", err);
      alert("複製 Prompt 失敗，請手動複製。");
    }
  }, [metaResult]);

  const ensureContextVector = useCallback(async () => {
    if (!analysis || !analysis.analysis) {
      throw new Error("尚未產生分析結果，請先執行分析。");
    }
    if (contextVector) return contextVector;
    if (contextVectorPromiseRef.current) return contextVectorPromiseRef.current;

    setIsGeneratingContext(true);
    setContextVectorError(null);

    const promise = (async () => {
      try {
        const res = await fetch("/api/report/context-vector", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analysisText: analysis.analysis, pageUrl: data.page }),
        });
        if (!res.ok) {
          throw new Error(`Context vector 取得失敗：${res.status}`);
        }
        const json = await res.json();
        if (!json?.success) {
          throw new Error(json?.error || "Context vector API 回傳錯誤");
        }
        const markdown = selectContextVectorMarkdown(json);
        setContextVector(markdown);
        return markdown;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setContextVectorError(message);
        throw err;
      } finally {
        setIsGeneratingContext(false);
        contextVectorPromiseRef.current = null;
      }
    })();

    contextVectorPromiseRef.current = promise;
    return promise;
  }, [analysis, contextVector, data.page]);

  const ensureOutline = useCallback(async () => {
    if (!analysis || !analysis.analysis) {
      throw new Error("尚未產生分析結果，請先執行分析。");
    }
    if (outline) return outline;
    if (outlinePromiseRef.current) return outlinePromiseRef.current;

    setOutlineError(null);

    const promise = (async () => {
      try {
        const res = await fetch("/api/report/outline", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analyzeResult: analysis.analysis }),
        });
        if (!res.ok) {
          throw new Error(`Outline 取得失敗：${res.status}`);
        }
        const json = await res.json();
        if (!json?.success || !json?.outline) {
          throw new Error("Outline API 回傳錯誤");
        }
        setOutline(json.outline);
        return json.outline as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOutlineError(message);
        throw err;
      } finally {
        outlinePromiseRef.current = null;
      }
    })();

    outlinePromiseRef.current = promise;
    return promise;
  }, [analysis, outline]);

  const handleCopyToClipboard = useCallback(
    async (format: "markdown" | "csv" | "email", _isStandardFallback = false) => {
      if (!analysis || !analysis.analysis) return;

      try {
        switch (format) {
          case "markdown": {
            const extractedData = extractAnalysisData(analysis.analysis, {
              page: data.page,
              best_query: data.best_query || "",
            });
            const content = formatAsMarkdown(extractedData);
            await navigator.clipboard.writeText(content);
            setCopiedFormat("markdown");
            setTimeout(() => setCopiedFormat(null), 2000);
            break;
          }
          case "csv": {
            const context = await ensureContextVector();
            await navigator.clipboard.writeText(context);
            setCopiedFormat("csv");
            setTimeout(() => setCopiedFormat(null), 2000);
            return;
          }
          case "email": {
            setIsGeneratingEmail(true);
            const [context, outlineText] = await Promise.all([
              ensureContextVector(),
              ensureOutline(),
            ]);
            const emailHtml = buildEmailHtml({
              pageUrl: data.page,
              bestQuery: data.best_query || "",
              analysisText: analysis.analysis,
              apiAnalysis: analysis,
              contextVector: context,
              outline: outlineText,
            });
            await navigator.clipboard.writeText(emailHtml);
            setCopiedFormat("email");
            setTimeout(() => setCopiedFormat(null), 2000);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        const message = error instanceof Error ? error.message : "Failed to copy to clipboard";
        alert(message);
      } finally {
        if (format === "email") {
          setIsGeneratingEmail(false);
        }
      }
    },
    [analysis, data, ensureContextVector, ensureOutline],
  );
  ;

  // Get click intensity for visual indicator
  const clickIntensity = Math.min(100, (data.best_query_clicks || 0) / 10);

  const firstSeenDate: string | null = (() => {
    const raw = data?.first_seen_date;
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" });
  })();

  const previousClicksDisplay = formatNumberDisplay(data?.previous_period_clicks);
  const previousImpressionsDisplay = formatNumberDisplay(data?.previous_period_impressions);

  // Map new field name and parse numeric rank change if available
  const positionChange: number | null = (() => {
    const raw = (data as any)?.keyword_rank_change;
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return isFinite(raw) ? raw : null;
    const n = parseFloat(String(raw).replace(/[^-\d.]/g, ""));
    return isFinite(n) ? n : null;
  })();

  // Format URL for display
  const formatUrl = (url: string) => {
    try {
      const decoded = decodeURIComponent(url);
      const pathParts = decoded.split("/");
      const lastPart =
        pathParts[pathParts.length - 1] ?? pathParts[pathParts.length - 2] ?? "";

      // Remove query parameters and clean up
      const [beforeQuery = ""] = String(lastPart).split("?");
      const [beforeHash = ""] = beforeQuery.split("#");
      const cleanPart = beforeHash;

      // Add ellipsis if too long
      if (cleanPart.length > 25) {
        return cleanPart.substring(0, 22) + "...";
      }
      return cleanPart;
    } catch {
      // Fallback if decode fails
      const parts = url.split("/");
      const last = parts[parts.length - 1] || "homepage";
      return last.length > 25 ? last.substring(0, 22) + "..." : last;
    }
  };

  // Generic Table (reusing the original structure) that supports custom headers/rows
    const handleContentExplorer = useCallback(async () => {
    if (isFetchingExplorer) return;
    setIsFetchingExplorer(true);
    setExplorerError(null);
    try {
      const rows = collectAllCurrentRows(data);
      // unique by keyword with max impressions
      const uniq: Record<string, { keyword: string; impressions: number }> = {};
      for (const r of rows) {
        const key = normalizeKeyword(r.keyword);
        const imps = typeof r.impressions === "number" && isFinite(r.impressions) ? r.impressions : 0;
        if (!key) continue;
        const current = uniq[key];
        if (!current || imps > current.impressions) {
          uniq[key] = { keyword: r.keyword, impressions: imps };
        }
      }
      const topByImpr = Object.values(uniq)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3)
        .map((x) => x.keyword);
      if (topByImpr.length === 0) throw new Error("沒有可用的關鍵字（缺少 Impressions）");
      const resp = await fetch("/api/content-explorer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: topByImpr }),
      });
      const resJson = await resp.json();
      if (!resp.ok || !resJson?.success) throw new Error(resJson?.error || `Explorer failed: ${resp.status}`);
      setExplorerInsights(resJson);
      try { console.debug("[DataCard] content explorer", resJson); } catch { }
    } catch (e: any) {
      setExplorerError(e?.message || String(e));
    } finally {
      setIsFetchingExplorer(false);
    }
  }, [isFetchingExplorer, data]);

  // Normalize keywords to improve matching between API texts and table rows
  const handleFetchSV = useCallback(async () => {
    if (!data?.page || isFetchingSV) return;
    setIsFetchingSV(true);
    setSvError(null);
    setPotentialKeywords([]);
    setShowPotential(false);
    setHasFetchedCoverage(false);
    try {
      const res = await fetch("/api/keyword/coverage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: data.page, limit: 60 }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed to fetch coverage");
      const map: Record<string, number | null> = {};
      const fill = (arr: any[]) => {
        (arr || []).forEach((item) => {
          const original = String(item?.text || "");
          const k = normalizeKeyword(original);
          if (!k) return;
          map[k] = typeof item?.searchVolume === "number" && isFinite(item.searchVolume)
            ? item.searchVolume
            : null;
        });
      };
      fill(json.covered);
      fill(json.uncovered);
      // Debug summary for mapping keys
      try {
        const keys = Object.keys(map);
        console.debug("[DataCard] SV map built", {
          keysCount: keys.length,
          sample: keys.slice(0, 8),
          debugId: json?.debugId,
        });
      } catch { }
      setSvMap(map);

      const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
      const normalized = suggestions
        .map((item: any) => {
          const keyword = String(item?.text || "").trim();
          if (!keyword) return null;
          const displayKeyword = keyword.replace(/[\s\u3000]+/g, "");
          if (!displayKeyword) return null;
          const sv = typeof item?.searchVolume === "number" && Number.isFinite(item.searchVolume)
            ? item.searchVolume
            : null;
          const clicks = typeof item?.gsc?.clicks === "number" && Number.isFinite(item.gsc.clicks)
            ? item.gsc.clicks
            : null;
          return { keyword: displayKeyword, searchVolume: sv, clicks };
        })
        .filter(Boolean) as { keyword: string; searchVolume: number | null; clicks: number | null }[];

      setPotentialKeywords(normalized);
    } catch (e: any) {
      setSvError(e?.message || String(e));
      setPotentialKeywords([]);
    } finally {
      setHasFetchedCoverage(true);
      setIsFetchingSV(false);
    }
  }, [data?.page, isFetchingSV]);

  return (
    <article className="group relative border border-[var(--gray-7)] bg-[var(--gray-8)] transition-all duration-[var(--duration-normal)] hover:border-[var(--gray-4)]">
      {/* Click intensity indicator - subtle left border */}
      <div
        className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-[var(--accent-primary)] to-transparent"
        style={{ opacity: Math.min(1, clickIntensity / 100 + 0.3) }}
      />

      <div className="p-[var(--space-lg)]">
        {/* Header: Query and Clicks */}
        <div className="mb-[var(--space-md)]">
          {data.best_query && (
            <div className="mb-[var(--space-xs)] flex items-start justify-between gap-[var(--space-sm)]">
              <h3 className="line-clamp-2 flex-1 font-bold text-[var(--ink)] text-[var(--text-lg)] transition-colors group-hover:text-[var(--accent-primary)]">
                {data.best_query}
              </h3>
              {data.potential_traffic && (
                <span
                  className="rounded-sm bg-[var(--accent-primary)] px-[var(--space-sm)] py-1 font-bold text-[var(--paper)] text-[var(--text-xs)]"
                  title="Potential traffic if optimized"
                >
                  🎯 {Math.round(data.potential_traffic)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-[var(--space-md)]">
            <div className="flex items-baseline gap-[var(--space-xs)]">
              <span className="font-black text-[var(--accent-primary)] text-[var(--text-xl)]">
                {data.best_query_clicks || 0}
              </span>
              <span className="text-[var(--gray-5)] text-[var(--text-xs)] uppercase">
                clicks
              </span>
            </div>
            {data.best_query_position && (
              <div className="flex items-center gap-[var(--space-xs)] rounded-sm bg-[var(--gray-8)] px-[var(--space-sm)] py-1">
                <span className="text-[var(--gray-5)] text-[var(--text-xs)]">#</span>
                <span className="font-bold text-[var(--gray-3)] text-[var(--text-sm)]">
                  {data.best_query_position.toFixed(1)}
                </span>
                {positionChange !== null && positionChange !== undefined && (
                  <span
                    className={`ml-1 font-bold text-[var(--text-xs)] ${positionChange > 0
                        ? "text-green-500"
                        : positionChange < 0
                          ? "text-red-500"
                          : "text-[var(--gray-5)]"
                      }`}
                  >
                    {positionChange > 0
                      ? "↑"
                      : positionChange < 0
                        ? "↓"
                        : "-"}
                    {Math.abs(positionChange).toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* URL with Link and Stats - Properly formatted */}
        <div className="mb-[var(--space-md)]">
          <a
            href={data.page}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-[var(--space-xs)] block truncate text-[var(--gray-5)] text-[var(--text-xs)] transition-colors hover:text-[var(--accent-primary)]"
            title={data.page}
          >
            {formatUrl(data.page)}
          </a>
          {/* Stats bar */}
          <div className="flex items-center gap-[var(--space-md)] text-[var(--gray-5)] text-[var(--text-xs)]">
            {data.keywords_1to10_count !== null &&
              data.total_keywords !== null && (
                <span title="Keywords ranking 1-10 / Total keywords">
                  🎯 {data.keywords_1to10_count}/{data.total_keywords} words
                </span>
              )}
            {data.keywords_1to10_ratio !== null && (
              <span title="Percentage of keywords ranking 1-10">
                📈 {data.keywords_1to10_ratio}
              </span>
            )}
            {data.keywords_gt10_count !== null && data.keywords_gt10_count !== undefined && (
              <span title=">10 ranked keywords" className="text-[var(--gray-6)]">
                {'>'}10: {data.keywords_gt10_count}
              </span>
            )}
            {(previousClicksDisplay || previousImpressionsDisplay) && (
              <span title="Performance in comparison window (約 4 個月前)">
                ⏪ {previousClicksDisplay ?? '—'} clicks / {previousImpressionsDisplay ?? '—'} imp
              </span>
            )}
            {firstSeenDate && (
              <span title="首次偵測到的日期">
                🗓️ first seen {firstSeenDate}
              </span>
            )}
            {(() => {
              const toNumber = (value: unknown): number | null => {
                if (typeof value === "number") return Number.isFinite(value) ? value : null;
                if (typeof value === "string") {
                  const numeric = Number(value.replace(/[^0-9.\-]/g, ""));
                  return Number.isFinite(numeric) ? numeric : null;
                }
                return null;
              };

              const totalClicks = toNumber(data.total_clicks);
              const totalImpressions = toNumber((data as any)?.total_impressions);
              let ctr = toNumber((data as any)?.total_ctr);
              let clicksForCtr = totalClicks ?? null;
              let impsForCtr = totalImpressions ?? null;

              if (ctr === null && clicksForCtr !== null && impsForCtr !== null && impsForCtr > 0) {
                ctr = (clicksForCtr / impsForCtr) * 100;
              }

              if (ctr === null || impsForCtr === null || impsForCtr <= 0) {
                const rows = [
                  (data as any)?.current_rank_1,
                  (data as any)?.current_rank_2,
                  (data as any)?.current_rank_3,
                  (data as any)?.current_rank_4,
                  (data as any)?.current_rank_5,
                  (data as any)?.current_rank_6,
                  (data as any)?.current_rank_7,
                  (data as any)?.current_rank_8,
                  (data as any)?.current_rank_9,
                  (data as any)?.current_rank_10,
                  (data as any)?.current_rank_gt10,
                ].flatMap((s: any) => parseBucket("", s));

                let aggClicks = 0;
                let aggImpr = 0;
                rows.forEach((row) => {
                  if (typeof row.clicks === "number" && Number.isFinite(row.clicks)) aggClicks += row.clicks;
                  if (typeof row.impressions === "number" && Number.isFinite(row.impressions)) aggImpr += row.impressions;
                });

                if (!Number.isFinite(aggClicks) || !Number.isFinite(aggImpr) || aggImpr <= 0) return null;
                ctr = (aggClicks / aggImpr) * 100;
                clicksForCtr = aggClicks;
                impsForCtr = aggImpr;
              }

              if (ctr === null) return null;

              const score = Math.max(0, Math.min(100, Math.round((ctr / CTR_FULL_SCORE) * 100)));
              const ctrRounded = Math.round(ctr);
              const ctrDisplay = ctr.toFixed(2);
              const clicksDisplay = clicksForCtr !== null ? Math.round(clicksForCtr).toLocaleString() : "-";
              const impsDisplay = impsForCtr !== null ? Math.round(impsForCtr).toLocaleString() : "-";

              const size = 56; // px
              const stroke = 6;
              const r = (size - stroke) / 2;
              const c = 2 * Math.PI * r;
              const offset = c * (1 - score / 100);

              return (
                <div
                  className="flex items-center gap-[var(--space-xs)]"
                  title={`CTR: ${ctrDisplay}% • Clicks: ${clicksDisplay} • Impr.: ${impsDisplay} • SEO Score (CTR${CTR_FULL_SCORE}): ${score}`}
                >
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
                    <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--gray-7)" strokeWidth={stroke} fill="none" />
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      stroke="rgb(34 197 94)"
                      strokeWidth={stroke}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${c} ${c}`}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                    <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontWeight={900} fontSize={16} fill="rgb(34 197 94)">
                      {score}
                    </text>
                  </svg>
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold text-[var(--ink)] text-[var(--text-xs)]">SEO Score</span>
                    <span className="text-[var(--gray-6)] text-[10px]">CTR{CTR_FULL_SCORE} = 100 • CTR {ctrRounded}%</span>
                  </div>
                </div>
              );
            })()}
            {data.prev_main_keyword && data.prev_main_keyword !== data.best_query && (
              <span
                title="Previous best query"
                className="text-[var(--gray-6)] italic"
              >
                {data.prev_main_keyword}
              </span>
            )}
          </div>
        </div>

        <DataCardActions
          isLoading={isLoading}
          hasAnalysis={Boolean(analysis)}
          onAnalyze={handleAnalyze}
          onCopy={handleCopyToClipboard}
          copiedFormat={copiedFormat}
          isGeneratingContext={isGeneratingContext}
          isGeneratingEmail={isGeneratingEmail}
          contextVectorError={contextVectorError}
          showKeywords={showKeywords}
          onToggleKeywords={() => setShowKeywords((prev) => !prev)}
          onGenerateMeta={canGenerateMeta ? handleGenerateMeta : undefined}
          isGeneratingMeta={isGeneratingMeta}
          canGenerateMeta={canGenerateMeta}
          hasMetaResult={Boolean(metaResult?.report)}
        />

        {metaError && (
          <div className="mt-[var(--space-xs)] text-[var(--accent-primary)] text-[var(--text-xxs)]">
            {metaError}
          </div>
        )}

        {metaResult?.report && (
          <div className="mt-[var(--space-sm)] space-y-[var(--space-sm)] border border-[var(--gray-6)] bg-[var(--paper)] p-[var(--space-md)]">
            <div className="flex flex-wrap items-center justify-between gap-[var(--space-sm)]">
              <div className="flex flex-col gap-[2px]">
                <span className="font-black text-[var(--ink)] text-[var(--text-sm)] uppercase tracking-wide">
                  Meta Title 提案
                </span>
                {metaResult.targetKeyword?.keyword && (
                  <span className="text-[var(--gray-5)] text-[var(--text-xxs)]">
                    建議關鍵字：{metaResult.targetKeyword.keyword}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-[var(--space-xs)]">
                <button
                  onClick={handleCopyMeta}
                  className="border border-[var(--accent-primary)] bg-transparent px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--accent-primary)] text-[var(--text-xxs)] uppercase tracking-wide transition-colors hover:bg-[var(--accent-primary)] hover:text-[var(--paper)]"
                >
                  {metaCopied ? "已複製" : "複製內容"}
                </button>
                {metaResult.prompt && (
                  <button
                    onClick={handleCopyPrompt}
                    className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--gray-4)] text-[var(--text-xxs)] uppercase tracking-wide transition-colors hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
                  >
                    {metaPromptCopied ? "Prompt✓" : "複製 Prompt"}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-sm bg-[var(--gray-9)] p-[var(--space-md)] shadow-inner">
              <pre className="whitespace-pre-wrap break-words text-[var(--gray-2)] text-[var(--text-xs)] leading-relaxed">
                {metaResult.report}
              </pre>
            </div>

            {metaResult.prompt && (
              <details className="rounded-sm bg-[var(--gray-9)] p-[var(--space-sm)] text-[var(--text-xxs)] text-[var(--gray-5)]">
                <summary className="cursor-pointer text-[var(--gray-3)] text-[var(--text-xxs)] font-bold">
                  查看完整 Prompt
                </summary>
                <pre className="mt-[var(--space-xs)] max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words text-[var(--gray-4)]">
                  {metaResult.prompt}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Keywords - Hidden by default */}
        {showKeywords && (
          <KeywordInsightsPanel
            data={data}
            svMap={svMap}
            potentialKeywords={potentialKeywords}
            hasFetchedCoverage={hasFetchedCoverage}
            isFetchingSV={isFetchingSV}
            svError={svError}
            showPotential={showPotential}
            onTogglePotential={() => setShowPotential((v) => !v)}
            onFetchSV={handleFetchSV}
            onContentExplorer={handleContentExplorer}
            isFetchingExplorer={isFetchingExplorer}
            explorerError={explorerError}
            explorerInsights={explorerInsights}
            explorerShowAll={explorerShowAll}
            onToggleExplorerShowAll={() => setExplorerShowAll((v) => !v)}
            showZero={showZero}
            onToggleZero={() => setShowZero((v) => !v)}
            compareMode={compareMode}
            onToggleCompareMode={() => setCompareMode((v) => !v)}
          />
        )}
      </div>

      {/* Analysis Modal */}
      <AnalysisModal
        isOpen={isExpanded}
        onClose={handleClose}
        data={data}
        analysis={analysis}
        isLoading={isLoading}
        error={error}
      />
    </article>
  );
});
