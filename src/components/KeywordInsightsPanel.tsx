"use client";

import { memo, useMemo } from "react";
import { KeywordTable, TableShell } from "~/components/KeywordTable";
import {
  collectAllCurrentRows,
  normalizeKeyword,
  parseBucket,
} from "~/components/data-card-helpers";

type PotentialKeyword = {
  keyword: string;
  searchVolume: number | null;
  clicks: number | null;
};

type PrevStatMap = Record<string, { clicks: number | null; impressions: number | null; position: number | null }>;

type KeywordInsightsPanelProps = {
  data: any;
  svMap: Record<string, number | null>;
  potentialKeywords: PotentialKeyword[];
  hasFetchedCoverage: boolean;
  isFetchingSV: boolean;
  svError: string | null;
  showPotential: boolean;
  onTogglePotential: () => void;
  onFetchSV: () => void;
  onContentExplorer: () => void;
  isFetchingExplorer: boolean;
  explorerError: string | null;
  explorerInsights: any | null;
  explorerShowAll: boolean;
  onToggleExplorerShowAll: () => void;
  showZero: boolean;
  onToggleZero: () => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
};

export const KeywordInsightsPanel = memo(function KeywordInsightsPanel({
  data,
  svMap,
  potentialKeywords,
  hasFetchedCoverage,
  isFetchingSV,
  svError,
  showPotential,
  onTogglePotential,
  onFetchSV,
  onContentExplorer,
  isFetchingExplorer,
  explorerError,
  explorerInsights,
  explorerShowAll,
  onToggleExplorerShowAll,
  showZero,
  onToggleZero,
  compareMode,
  onToggleCompareMode,
}: KeywordInsightsPanelProps) {
  const buckets = useMemo(() => {
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

    const prevStatMap: PrevStatMap = {};
    const collectPrev = (raw?: string | null) => {
      parseBucket("", raw).forEach((row) => {
        const key = normalizeKeyword(row.keyword);
        if (!key) return;
        prevStatMap[key] = {
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
        };
      });
    };
    collectPrev((data as any)?.prev_rank_1);
    collectPrev((data as any)?.prev_rank_2);
    collectPrev((data as any)?.prev_rank_3);
    collectPrev((data as any)?.prev_rank_4);
    collectPrev((data as any)?.prev_rank_5);
    collectPrev((data as any)?.prev_rank_6);
    collectPrev((data as any)?.prev_rank_7);
    collectPrev((data as any)?.prev_rank_8);
    collectPrev((data as any)?.prev_rank_9);
    collectPrev((data as any)?.prev_rank_10);
    collectPrev((data as any)?.prev_rank_gt10);

    return { rowsTop, rowsMid, rowsGt, rowsZero, prevStatMap };
  }, [data]);

  const allCurrentRows = useMemo(() => collectAllCurrentRows(data), [data]);

  return (
    <div className="mt-[var(--space-md)] border-[var(--gray-7)] border-t pt-[var(--space-md)]">
      <div className="mb-[var(--space-sm)] flex items-center justify-between gap-[var(--space-sm)]">
        <div className="flex items-center gap-[var(--space-xs)]">
          <button
            onClick={onFetchSV}
            disabled={isFetchingSV}
            className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50"
            title="補搜尋量與潛在關鍵字"
          >
            {isFetchingSV ? "..." : "補搜尋量 / 潛在"}
          </button>
          <button
            onClick={onContentExplorer}
            disabled={isFetchingExplorer}
            className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50"
            title="Content Explorer (Top-3 by Impressions)"
          >
            {isFetchingExplorer ? "..." : "Content Explorer"}
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
          {(() => {
            const picked: string[] = explorerInsights.pickedQueries || [];
            const posMap: Record<string, number[]> = {};
            allCurrentRows.forEach((r) => {
              const key = normalizeKeyword(r.keyword);
              const p = typeof r.position === "number" && isFinite(r.position) ? r.position : null;
              if (!key || p === null) return;
              (posMap[key] ||= []).push(p);
            });

            const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
            const min = (arr: number[]) => (arr.length ? Math.min(...arr) : null);

            const insights = explorerInsights.insights || [];
            const findInsight = (q: string) => insights.find((i: any) => normalizeKeyword(i.query) === normalizeKeyword(q));

            return (
              <TableShell
                headers={["Query", "Lowest DR", "Avg Traffic", "Avg KW", "Avg Pos.", "Avg BL"]}
                rows={picked}
                renderRow={(q: string, idx: number) => {
                  const ins = findInsight(q);
                  const pages = (ins?.pages || ins?.topPages || []) as any[];
                  const withTraffic = pages.filter((p: any) => typeof p.pageTraffic === "number" && isFinite(p.pageTraffic) && p.pageTraffic > 0);
                  const drs = withTraffic
                    .map((p: any) => (typeof p.domainAuthority === "number" ? p.domainAuthority : NaN))
                    .filter((n: number) => isFinite(n)) as number[];
                  const bls = withTraffic
                    .map((p: any) => (typeof p.backlinks === "number" ? p.backlinks : NaN))
                    .filter((n: number) => isFinite(n)) as number[];
                  const traff = withTraffic.map((p: any) => p.pageTraffic as number);
                  const kws = withTraffic
                    .map((p: any) => (typeof p.pageKeywords === "number" ? p.pageKeywords : NaN))
                    .filter((n: number) => isFinite(n)) as number[];
                  const key = normalizeKeyword(q);
                  const poss = posMap[key] || [];

                  const lowestDr = min(drs);
                  const avgTraffic = avg(traff);
                  const avgKw = avg(kws);
                  const avgPos = avg(poss);
                  const avgBl = avg(bls);

                  return (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-[var(--gray-9)]" : undefined}>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)] max-w-[40ch] truncate">{q}</td>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)]">{lowestDr === null ? "-" : lowestDr}</td>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)]">{avgTraffic === null ? "-" : Math.round(avgTraffic).toLocaleString?.()}</td>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)]">{avgKw === null ? "-" : Math.round(avgKw).toLocaleString?.()}</td>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)]">{avgPos === null ? "-" : (avgPos as number).toFixed(1)}</td>
                      <td className="px-[var(--space-sm)] py-[var(--space-xs)]">{avgBl === null ? "-" : Math.round(avgBl).toLocaleString?.()}</td>
                    </tr>
                  );
                }}
              />
            );
          })()}
          {(() => {
            const insights = explorerInsights.insights || [];
            const map = new Map<string, any>();
            const keyFor = (x: any) =>
              x?.url
                ? `u:${String(x.url).toLowerCase()}`
                : `t:${String(x.title || "").toLowerCase().trim()}|d:${String(x.domain || "").toLowerCase().trim()}`;
            const pickBetter = (a: any, b: any) => {
              const at = typeof a.pageTraffic === "number" ? a.pageTraffic : -1;
              const bt = typeof b.pageTraffic === "number" ? b.pageTraffic : -1;
              if (bt > at) return b;
              if (at > bt) return a;
              const as = typeof a.score === "number" ? a.score : 0;
              const bs = typeof b.score === "number" ? b.score : 0;
              return bs > as ? b : a;
            };
            insights.forEach((i: any) => {
              (i.pages || i.topPages || []).forEach((p: any) => {
                const k = keyFor(p);
                const prev = map.get(k);
                map.set(k, prev ? pickBetter(prev, p) : p);
              });
            });
            const allRows: any[] = Array.from(map.values());
            allRows.sort((a, b) => {
              const at = typeof a.pageTraffic === "number" ? a.pageTraffic : -1;
              const bt = typeof b.pageTraffic === "number" ? b.pageTraffic : -1;
              if (bt !== at) return bt - at;
              const as = typeof a.score === "number" ? a.score : 0;
              const bs = typeof b.score === "number" ? b.score : 0;
              return bs - as;
            });
            const visible = allRows.slice(0, 5).concat(explorerShowAll ? allRows.slice(5) : []);
            return (
              <TableShell
                headers={["Rank", "Title", "Domain", "Type", "DR", "Traffic", "KW", "BL"]}
                rows={visible}
                renderRow={(r: any, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-[var(--gray-9)]" : undefined}>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--gray-4)]">{idx + 1}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] max-w-[40ch] truncate font-medium text-[var(--ink)]">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-[var(--accent-primary)]"
                        >
                          {r.title}
                        </a>
                      ) : (
                        r.title || "-"
                      )}
                    </td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{r.domain || "-"}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{r.siteType || "-"}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{typeof r.domainAuthority === "number" ? r.domainAuthority : "-"}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{typeof r.pageTraffic === "number" ? r.pageTraffic.toLocaleString?.() : "-"}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{typeof r.pageKeywords === "number" ? r.pageKeywords.toLocaleString?.() : "-"}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">
                      {typeof r.backlinks === "number"
                        ? r.backlinks.toLocaleString?.() ?? r.backlinks
                        : r.backlinks || "-"}
                    </td>
                  </tr>
                )}
              />
            );
          })()}
          <div className="mt-[var(--space-xs)]">
            <button
              onClick={onToggleExplorerShowAll}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
            >
              {explorerShowAll ? "Show Top 5" : "Show All"}
            </button>
          </div>
          {(() => {
            const insights = explorerInsights.insights || [];
            const allPaaMap = new Map<string, { query: string; question: string; source_url?: string }>();
            const normalizeQuestion = (q: string) => q.replace(/^\[[^\]]+\]\s*/, '').trim().toLowerCase();
            insights.forEach((i: any) => {
              (i.paa || []).forEach((p: any) => {
                const qRaw = String(p?.question || "").trim();
                if (!qRaw) return;
                const key = normalizeQuestion(qRaw);
                if (!allPaaMap.has(key)) allPaaMap.set(key, { query: i.query, question: qRaw, source_url: p?.source_url });
              });
            });
            const rows = Array.from(allPaaMap.values());
            if (rows.length === 0) return null;
            return (
              <TableShell
                title="People Also Ask"
                headers={["Query", "Question"]}
                rows={rows.slice(0, 20)}
                renderRow={(p: any, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-[var(--gray-9)]" : undefined}>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap text-[var(--ink)]">{p.query}</td>
                    <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)]">
                      {p.source_url ? (
                        <a
                          href={p.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-[var(--accent-primary)]"
                        >
                          {p.question}
                        </a>
                      ) : (
                        p.question
                      )}
                    </td>
                  </tr>
                )}
              />
            );
          })()}
          {(() => {
            const t = explorerInsights.overall?.siteTypes as Record<string, number> | undefined;
            if (!t) return null;
            const entries = Object.entries(t).filter(([, v]) => typeof v === "number" && v > 0);
            if (entries.length === 0) return null;
            return (
              <div className="mt-[var(--space-xs)] flex flex-wrap items-center gap-[4px]">
                <span className="mr-[4px] text-[var(--gray-5)]">Types:</span>
                {entries.map(([k, v], i) => (
                  <span key={i} className="rounded-sm bg-[var(--gray-8)] px-[6px] py-[2px] text-[var(--ink)]">
                    {k} {v}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {potentialKeywords.length > 0 && (
        <div className="mb-[var(--space-sm)]">
          <button
            onClick={onTogglePotential}
            className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
          >
            {showPotential ? "隱藏潛在關鍵字" : `顯示潛在關鍵字 (${potentialKeywords.length})`}
          </button>
          {showPotential && (
            <TableShell
              headers={["#", "Keyword", "Search Volume", "Clicks"]}
              rows={potentialKeywords}
              renderRow={(row, idx) => (
                <tr key={row.keyword} className={idx % 2 === 0 ? "bg-[var(--gray-9)]" : undefined}>
                  <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--gray-4)]">{idx + 1}</td>
                  <td className="px-[var(--space-sm)] py-[var(--space-xs)] max-w-[40ch] truncate text-[var(--ink)]">{row.keyword}</td>
                  <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)]">
                    {row.searchVolume === null ? "-" : Math.round(row.searchVolume).toLocaleString?.() ?? row.searchVolume}
                  </td>
                  <td className="px-[var(--space-sm)] py-[var(--space-xs)] text-[var(--ink)]">{row.clicks === null ? "-" : row.clicks}</td>
                </tr>
              )}
            />
          )}
        </div>
      )}

      {potentialKeywords.length === 0 && hasFetchedCoverage && !isFetchingSV && !svError && (
        <div className="mb-[var(--space-sm)] text-[var(--gray-5)] text-[var(--text-xs)]">未找到潛在關鍵字</div>
      )}

      <KeywordTable
        title="Top Keywords (1–3)"
        rows={buckets.rowsTop}
        svMap={svMap}
        prevStatMap={buckets.prevStatMap}
        compareMode={compareMode}
      />
      <KeywordTable
        title="Opportunity Keywords (4–10)"
        rows={buckets.rowsMid}
        svMap={svMap}
        prevStatMap={buckets.prevStatMap}
        compareMode={compareMode}
      />
      <KeywordTable
        title=">10 Keywords"
        rows={buckets.rowsGt}
        svMap={svMap}
        prevStatMap={buckets.prevStatMap}
        compareMode={compareMode}
      />
      <div className="mt-[var(--space-sm)]">
        <button
          onClick={onToggleZero}
          className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
        >
          {showZero ? "Hide Zero-click" : `Show Zero-click (${buckets.rowsZero.length})`}
        </button>
        <button
          onClick={onToggleCompareMode}
          className="ml-[var(--space-sm)] border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-1 font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
          title="切換比較模式"
        >
          {compareMode ? "比較模式：開" : "比較模式：關"}
        </button>
        {showZero && (
          <KeywordTable
            title="Zero-click Keywords"
            rows={buckets.rowsZero}
            svMap={svMap}
            prevStatMap={buckets.prevStatMap}
            compareMode={compareMode}
          />
        )}
      </div>
    </div>
  );
});
