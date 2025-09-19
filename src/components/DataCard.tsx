"use client";

import { memo, useCallback, useState } from "react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { extractAnalysisData, formatAsEmail, formatAsMarkdown } from "~/utils/extract-format-html";
import { fetchContentExplorerForQueries } from "~/utils/search-traffic";

export const DataCard = memo(function DataCard({
  data,
  onModalChange,
}: { data: any; onModalChange?: (isOpen: boolean) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const isGeneratingEmail = false;
  const [svMap, setSvMap] = useState<Record<string, number | null>>({});
  const [isFetchingSV, setIsFetchingSV] = useState(false);
  const [svError, setSvError] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);
  const [compareMode, setCompareMode] = useState(true);
  const [isFetchingExplorer, setIsFetchingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerInsights, setExplorerInsights] = useState<any | null>(null);

  const handleAnalyze = useCallback(() => {
    const run = async () => {
      if (hasAnalyzed || isLoading) return;
      setHasAnalyzed(true);
      setIsLoading(true);
      setError(null);
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
            rank4: (data as any)?.current_rank_4,
            rank5: (data as any)?.current_rank_5,
            rank6: (data as any)?.current_rank_6,
            rank7: (data as any)?.current_rank_7,
            rank8: (data as any)?.current_rank_8,
            rank9: (data as any)?.current_rank_9,
            rank10: (data as any)?.current_rank_10,
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

  const handleCopyToClipboard = useCallback(
    async (format: "markdown" | "csv" | "email", isStandardFallback = false) => {
      if (!analysis || !analysis.analysis) return;

      // For email format and not a fallback, try AI generation first
      if (format === "email" && !isStandardFallback && !isGeneratingEmail) {
        alert("Email generation disabled in REST refactor");
        return;
      }

      // Standard format handling (for non-email or fallback)
      try {
        const extractedData = extractAnalysisData(analysis.analysis, {
          page: data.page,
          best_query: data.best_query || "",
        });

        let content = "";
        switch (format) {
          case "markdown":
            content = formatAsMarkdown(extractedData);
            break;
          case "csv": {
            try {
              setIsGeneratingContext(true);
              const res = await fetch("/api/report/context-vector", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ analysisText: analysis.analysis, pageUrl: data.page }),
              });
              const json = await res.json();
              if (json?.success && json?.content) {
                await navigator.clipboard.writeText(json.content);
                setCopiedFormat("csv");
                setTimeout(() => setCopiedFormat(null), 2000);
              } else {
                alert("Failed to generate context vector");
              }
            } finally {
              setIsGeneratingContext(false);
            }
            return;
          }
          case "email":
            content = formatAsEmail(extractedData);
            break;
        }

        await navigator.clipboard.writeText(content);
        setCopiedFormat(format);

        // Reset copied state after 2 seconds
        setTimeout(() => {
          setCopiedFormat(null);
        }, 2000);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        alert("Failed to copy to clipboard");
      }
    },
    [analysis, data, isGeneratingEmail],
  );

  // Get click intensity for visual indicator
  const clickIntensity = Math.min(100, (data.best_query_clicks || 0) / 10);

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

  // Helpers to parse keyword strings into table rows
  type KwRow = {
    rank: string;
    keyword: string;
    clicks: number | null;
    impressions: number | null;
    position: number | null;
    ctr: number | null; // percent
  };

  const splitEntries = (raw?: string | null): string[] => {
    if (!raw || typeof raw !== "string") return [];
    const parts = raw.split(/\),\s+/);
    return parts.map((p, i) => (i < parts.length - 1 && !p.endsWith(")")) ? (p + ")") : p);
  };

  const parseEntry = (label: string, part: string): KwRow => {
    // Pattern with CTR present
    let m = part.match(/^(.+?)\(\s*click\s*:\s*([\d.]+)\s*,\s*impression\s*:\s*([\d.]+)\s*,\s*position\s*:\s*([\d.]+)\s*,\s*ctr\s*:\s*([\d.]+)%\s*\)$/i);
    if (m) {
      return {
        rank: label,
        keyword: (m[1] ?? "").trim(),
        clicks: Number.isFinite(Number(m[2])) ? Number(m[2]) : null,
        impressions: Number.isFinite(Number(m[3])) ? Number(m[3]) : null,
        position: Number.isFinite(Number(m[4])) ? Number(m[4]) : null,
        ctr: Number.isFinite(Number(m[5])) ? Number(m[5]) : null,
      };
    }
    // Pattern without CTR
    m = part.match(/^(.+?)\(\s*click\s*:\s*([\d.]+)\s*,\s*impression\s*:\s*([\d.]+)\s*,\s*position\s*:\s*([\d.]+)\s*\)$/i);
    if (m) {
      return {
        rank: label,
        keyword: (m[1] ?? "").trim(),
        clicks: Number.isFinite(Number(m[2])) ? Number(m[2]) : null,
        impressions: Number.isFinite(Number(m[3])) ? Number(m[3]) : null,
        position: Number.isFinite(Number(m[4])) ? Number(m[4]) : null,
        ctr: null,
      };
    }
    const name = part.includes("(") ? part.slice(0, part.indexOf("(")).trim() : part.trim();
    return { rank: label, keyword: name, clicks: null, impressions: null, position: null, ctr: null };
  };

  const parseBucket = (label: string, raw?: string | null): KwRow[] => {
    return splitEntries(raw).map((p) => parseEntry(label, p));
  };

  const collectAllCurrentRows = (): KwRow[] => {
    const rowsTop = [
      ...parseBucket("1", (data as any)?.current_rank_1),
      ...parseBucket("2", (data as any)?.current_rank_2),
      ...parseBucket("3", (data as any)?.current_rank_3),
    ];
    const rowsMid = [
      ...parseBucket("4", (data as any)?.current_rank_4),
      ...parseBucket("5", (data as any)?.current_rank_5),
      ...parseBucket("6", (data as any)?.current_rank_6),
      ...parseBucket("7", (data as any)?.current_rank_7),
      ...parseBucket("8", (data as any)?.current_rank_8),
      ...parseBucket("9", (data as any)?.current_rank_9),
      ...parseBucket("10", (data as any)?.current_rank_10),
    ];
    const rowsGt = parseBucket(">10", (data as any)?.current_rank_gt10);
    return [...rowsTop, ...rowsMid, ...rowsGt];
  };

  const handleContentExplorer = useCallback(async () => {
    if (isFetchingExplorer) return;
    setIsFetchingExplorer(true);
    setExplorerError(null);
    try {
      const rows = collectAllCurrentRows();
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
      const res = await fetchContentExplorerForQueries(topByImpr);
      setExplorerInsights(res);
      try { console.debug("[DataCard] content explorer", res); } catch {}
    } catch (e: any) {
      setExplorerError(e?.message || String(e));
    } finally {
      setIsFetchingExplorer(false);
    }
  }, [isFetchingExplorer, data]);

  // Normalize keywords to improve matching between API texts and table rows
  const normalizeKeyword = (raw: string): string => {
    try {
      return String(raw)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u3000\s]+/g, "") // remove half/full-width spaces
        .replace(/[\u200b-\u200d\ufeff]/g, "") // zero-width chars
        .replace(/['"`’“”‘、/\\|,:;._+~!@#$%^&*()（）\[\]【】{}<>?\-]+/g, "");
    } catch {
      return String(raw).trim().toLowerCase();
    }
  };

  const handleFetchSV = useCallback(async () => {
    if (!data?.page || isFetchingSV) return;
    setIsFetchingSV(true);
    setSvError(null);
    try {
      const res = await fetch("/api/keyword/coverage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Rely on backend default capping/sorting; no need to send limit
        body: JSON.stringify({ url: data.page }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed to fetch SV");
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
      } catch {}
      setSvMap(map);
    } catch (e: any) {
      setSvError(e?.message || String(e));
    } finally {
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
                    className={`ml-1 font-bold text-[var(--text-xs)] ${
                        positionChange > 0
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
          {(() => {
            // Use ALL clicked keywords (ranks 1–10 and >10), weighted by impressions
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

            const clicks = rows.map(r => r.clicks).filter((v): v is number => v !== null && isFinite(v));
            const imps = rows.map(r => r.impressions).filter((v): v is number => v !== null && isFinite(v));
            const totalClicks = clicks.reduce((a, b) => a + b, 0);
            const totalImpr = imps.reduce((a, b) => a + b, 0);
            if (!isFinite(totalClicks) || !isFinite(totalImpr) || totalImpr <= 0) return null;

            const wCtr = (totalClicks / totalImpr) * 100;
            const wCtrInt = Math.round(wCtr);
            const score = Math.min(100, Math.round((wCtr / 30) * 100));

            const size = 56; // px
            const stroke = 6;
            const r = (size - stroke) / 2;
            const c = 2 * Math.PI * r;
            const offset = c * (1 - score / 100);

            return (
              <div className="flex items-center gap-[var(--space-xs)]" title={`Weighted CTR (clicked): ${wCtrInt}% • SEO Score (CTR30): ${score}`}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
                  <circle cx={size/2} cy={size/2} r={r} stroke="var(--gray-7)" strokeWidth={stroke} fill="none" />
                  <circle
                    cx={size/2}
                    cy={size/2}
                    r={r}
                    stroke="rgb(34 197 94)"
                    strokeWidth={stroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${c} ${c}`}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size/2} ${size/2})`}
                  />
                  <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontWeight={900} fontSize={16} fill="rgb(34 197 94)">
                    {score}
                  </text>
                </svg>
                <div className="flex flex-col leading-tight">
                  <span className="font-bold text-[var(--ink)] text-[var(--text-xs)]">SEO Score</span>
                  <span className="text-[var(--gray-6)] text-[10px]">CTR30 = 100 • wCTR {wCtrInt}%</span>
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

        {/* Actions Row - Improved styling */}
        <div className="flex items-center gap-[var(--space-sm)]">
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="flex-1 border-2 border-[var(--ink)] bg-transparent px-[var(--space-md)] py-[var(--space-sm)] font-bold text-[var(--ink)] text-[var(--text-sm)] uppercase transition-all duration-[var(--duration-fast)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
        >
          {isLoading ? "LOADING..." : "ANALYZE"}
        </button>

        {analysis && (
          <div className="flex gap-[var(--space-xs)]">
            <button
              onClick={() => handleCopyToClipboard("markdown")}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
              title="Copy as Markdown"
            >
              {copiedFormat === "markdown" ? "✓" : "MD"}
            </button>
            <button
              onClick={() => handleCopyToClipboard("csv")}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
              title="Copy as CSV"
            >
          {isGeneratingContext ? "..." : copiedFormat === "csv" ? "✓" : "CSV"}
        </button>
            <button
              onClick={() => handleCopyToClipboard("email")}
              disabled={isGeneratingEmail}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50 disabled:cursor-not-allowed"
              title={isGeneratingEmail ? "Generating AI Email..." : "Copy as Email (AI Enhanced)"}
            >
              {isGeneratingEmail ? "..." : copiedFormat === "email" ? "✓" : "✉"}
            </button>
          </div>
        )}

        <button
          onClick={() => setShowKeywords(!showKeywords)}
          className="px-[var(--space-md)] py-[var(--space-sm)] text-[var(--gray-5)] text-[var(--text-xs)] underline transition-all duration-[var(--duration-fast)] hover:text-[var(--accent-primary)]"
        >
          {showKeywords ? "HIDE" : "+KEYWORDS"}
        </button>
        </div>

        {/* Keywords - Hidden by default */}
        {showKeywords && (
          <div className="mt-[var(--space-md)] border-[var(--gray-7)] border-t pt-[var(--space-md)]">
            <div className="mb-[var(--space-sm)] flex items-center justify-between gap-[var(--space-sm)]">
              <div className="flex items-center gap-[var(--space-xs)]">
                <button
                  onClick={handleFetchSV}
                  disabled={isFetchingSV}
                  className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50"
                  title="Fetch Search Volume"
                >
                  {isFetchingSV ? "…" : "補搜尋量"}
                </button>
                <button
                  onClick={handleContentExplorer}
                  disabled={isFetchingExplorer}
                  className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50"
                  title="Content Explorer (Top-3 by Impressions)"
                >
                  {isFetchingExplorer ? "…" : "Content Explorer"}
                </button>
                {svError && (
                  <span className="text-red-500 text-[var(--text-xs)]">{svError}</span>
                )}
                {explorerError && (
                  <span className="text-red-500 text-[var(--text-xs)]">{explorerError}</span>
                )}
              </div>
            </div>
            {explorerInsights && (
              <div className="mb-[var(--space-sm)] rounded-sm border border-[var(--gray-7)] bg-[var(--gray-9)] p-[var(--space-sm)] text-[var(--text-xs)] text-[var(--gray-3)]">
                <div className="mb-[var(--space-xs)] font-bold text-[var(--ink)]">Content Explorer (Top-3 by Impressions)</div>
                <div className="mb-[var(--space-xs)]">Queries: {(explorerInsights.pickedQueries || []).join(", ") || "-"}</div>
                <div className="mb-[var(--space-xs)]">Avg DA: {explorerInsights.overall?.avgDomainAuthority ?? "-"}</div>
                {(() => {
                  const best = explorerInsights.overall?.bestPage;
                  if (!best) return null;
                  return (
                    <div className="mb-[var(--space-xs)]">
                      Best Page: <a href={best.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent-primary)]">
                        {best.title}
                      </a> ({best.domain})
                    </div>
                  );
                })()}
                {(() => {
                  const t = explorerInsights.overall?.siteTypes as Record<string, number> | undefined;
                  if (!t) return null;
                  const entries = Object.entries(t).filter(([, v]) => typeof v === "number" && v > 0);
                  if (entries.length === 0) return null;
                  const label = (k: string) => k;
                  return (
                    <div className="mt-[var(--space-xs)] flex flex-wrap items-center gap-[4px]">
                      <span className="mr-[4px] text-[var(--gray-5)]">Types:</span>
                      {entries.map(([k, v], i) => (
                        <span key={i} className="rounded-sm bg-[var(--gray-8)] px-[6px] py-[2px] text-[var(--ink)]">
                          {label(k)} {v}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            {(() => {
              // Build previous stats map: keyword -> {clicks, impressions, position}
              const prevStatMap = (() => {
                const map: Record<string, { clicks: number | null; impressions: number | null; position: number | null }> = {};
                const collect = (raw?: string | null) => {
                  parseBucket("", raw).forEach((row) => {
                    const key = normalizeKeyword(row.keyword);
                    if (!key) return;
                    map[key] = { clicks: row.clicks, impressions: row.impressions, position: row.position };
                  });
                };
                collect((data as any)?.prev_rank_1);
                collect((data as any)?.prev_rank_2);
                collect((data as any)?.prev_rank_3);
                collect((data as any)?.prev_rank_4);
                collect((data as any)?.prev_rank_5);
                collect((data as any)?.prev_rank_6);
                collect((data as any)?.prev_rank_7);
                collect((data as any)?.prev_rank_8);
                collect((data as any)?.prev_rank_9);
                collect((data as any)?.prev_rank_10);
                collect((data as any)?.prev_rank_gt10);
                return map;
              })();

              const rowsTop = [
                ...parseBucket("1", (data as any)?.current_rank_1),
                ...parseBucket("2", (data as any)?.current_rank_2),
                ...parseBucket("3", (data as any)?.current_rank_3),
              ];
              const rowsMid = [
                ...parseBucket("4", (data as any)?.current_rank_4),
                ...parseBucket("5", (data as any)?.current_rank_5),
                ...parseBucket("6", (data as any)?.current_rank_6),
                ...parseBucket("7", (data as any)?.current_rank_7),
                ...parseBucket("8", (data as any)?.current_rank_8),
                ...parseBucket("9", (data as any)?.current_rank_9),
                ...parseBucket("10", (data as any)?.current_rank_10),
              ];
              const rowsGt = parseBucket(">10", (data as any)?.current_rank_gt10);
              const rowsZero = parseBucket("", (data as any)?.zero_click_keywords);

              const Table = ({ title, rows }: { title: string; rows: KwRow[] }) => (
                <div className="mb-[var(--space-md)]">
                  <div className="mb-[var(--space-xs)] text-left font-bold text-[var(--ink)] text-[var(--text-sm)]">{title}</div>
                  {rows.length === 0 ? (
                    <div className="text-[var(--gray-5)] text-[var(--text-xs)]">No data</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[var(--text-xs)]">
                        <thead>
                          <tr className="border-b border-[var(--gray-7)] text-[var(--gray-4)]">
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">Rank</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)]">Keyword</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)]">SV</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">Clicks</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">Impr.</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">Pos.</th>
                            <th className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">CTR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-[var(--gray-9)]" : undefined}>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--gray-4)] whitespace-nowrap">{r.rank}</td>
                              <td className="max-w-[28ch] truncate px-[var(--space-sm)] py-[var(--space-xs)] font-medium text-[var(--ink)]">{r.keyword}</td>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)]">
                                {(() => {
                                  const key = normalizeKeyword(r.keyword);
                                  const sv = svMap[key];
                                  if (typeof sv !== "number") {
                                    // Light debug to help diagnose mismatches
                                    try { console.debug("[DataCard] SV miss", { raw: r.keyword, key }); } catch {}
                                  }
                                  return typeof sv === "number" ? sv : "-";
                                })()}
                              </td>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)] whitespace-nowrap">
                                {(() => {
                                  const key = normalizeKeyword(r.keyword);
                                  const prev = prevStatMap[key]?.clicks ?? null;
                                  const now = r.clicks ?? null;
                                  if (!compareMode) return now ?? "-";
                                  const cls = prev === null || now === null
                                    ? "text-[var(--gray-4)]"
                                    : now > prev
                                      ? "text-green-500"
                                      : now < prev
                                        ? "text-red-500"
                                        : "text-[var(--gray-4)]";
                                  return <span className={`font-semibold ${cls}`}>{prev ?? "-"} → {now ?? "-"}</span>;
                                })()}
                              </td>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)] whitespace-nowrap">
                                {(() => {
                                  const key = normalizeKeyword(r.keyword);
                                  const prev = prevStatMap[key]?.impressions ?? null;
                                  const now = r.impressions ?? null;
                                  if (!compareMode) return now ?? "-";
                                  const cls = prev === null || now === null
                                    ? "text-[var(--gray-4)]"
                                    : now > prev
                                      ? "text-green-500"
                                      : now < prev
                                        ? "text-red-500"
                                        : "text-[var(--gray-4)]";
                                  return <span className={`font-semibold ${cls}`}>{prev ?? "-"} → {now ?? "-"}</span>;
                                })()}
                              </td>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)] whitespace-nowrap">
                                {(() => {
                                  const key = normalizeKeyword(r.keyword);
                                  const prev = prevStatMap[key]?.position ?? null;
                                  const now = r.position ?? null;
                                  if (!compareMode) return now?.toFixed ? now.toFixed(1) : now ?? "-";
                                  const fmt = (n: number | null) => (n === null ? "-" : (n.toFixed ? n.toFixed(1) : String(n)));
                                  const cls = prev === null || now === null
                                    ? "text-[var(--gray-4)]"
                                    : now < prev
                                      ? "text-green-500"
                                      : now > prev
                                        ? "text-red-500"
                                        : "text-[var(--gray-4)]";
                                  return <span className={`font-semibold ${cls}`}>{fmt(prev)} → {fmt(now)}</span>;
                                })()}
                              </td>
                              <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)] whitespace-nowrap">
                                {(() => {
                                  const key = normalizeKeyword(r.keyword);
                                  const p = prevStatMap[key];
                                  const prevCtr = p && typeof p.clicks === "number" && typeof p.impressions === "number" && p.impressions > 0
                                    ? (p.clicks / p.impressions) * 100
                                    : null;
                                  const nowCtr = typeof r.clicks === "number" && typeof r.impressions === "number" && r.impressions > 0
                                    ? (r.clicks / r.impressions) * 100
                                    : null;
                                  if (!compareMode) return nowCtr === null ? "-" : `${nowCtr.toFixed(2)}%`;
                                  const cls = prevCtr === null || nowCtr === null
                                    ? "text-[var(--gray-4)]"
                                    : nowCtr > prevCtr
                                      ? "text-green-500"
                                      : nowCtr < prevCtr
                                        ? "text-red-500"
                                        : "text-[var(--gray-4)]";
                                  const fmt = (n: number | null) => (n === null ? "-" : `${n.toFixed(2)}%`);
                                  return <span className={`font-semibold ${cls}`}>{fmt(prevCtr)} → {fmt(nowCtr)}</span>;
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );

              return (
                <>
                  <Table title="Top Keywords (1–3)" rows={rowsTop} />
                  <Table title="Opportunity Keywords (4–10)" rows={rowsMid} />
                  <Table title=">10 Keywords" rows={rowsGt} />
                  <div className="mt-[var(--space-sm)]">
                    <button
                      onClick={() => setShowZero(!showZero)}
                      className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
                    >
                      {showZero ? "Hide Zero-click" : `Show Zero-click (${rowsZero.length})`}
                    </button>
                    <button
                      onClick={() => setCompareMode(!compareMode)}
                      className="ml-[var(--space-sm)] border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
                      title="切換比較模式"
                    >
                      {compareMode ? "比較模式：開" : "比較模式：關"}
                    </button>
                    {showZero && <Table title="Zero-click Keywords" rows={rowsZero} />}
                  </div>
                </>
              );
            })()}
          </div>
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
