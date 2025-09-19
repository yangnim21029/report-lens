"use client";

import React from "react";

export type KwRow = {
  rank: string;
  keyword: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  ctr: number | null;
};

export function KeywordTable({
  title,
  rows,
  svMap,
  prevStatMap,
  compareMode,
}: {
  title: string;
  rows: KwRow[];
  svMap: Record<string, number | null>;
  prevStatMap: Record<string, { clicks: number | null; impressions: number | null; position: number | null }>;
  compareMode: boolean;
}) {
  const normalizeKeyword = (raw: string): string => {
    try {
      return String(raw)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u3000\s]+/g, "")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/['"`’“”‘、/\\|,:;._+~!@#$%^&*()（）\[\]【】{}<>?\-]+/g, "");
    } catch {
      return String(raw).trim().toLowerCase();
    }
  };

  return (
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
                            : "text-[var(--gray-4)]`";
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
}

export function TableShell({
  title,
  headers,
  rows,
  renderRow,
}: {
  title?: string;
  headers: string[];
  rows: any[];
  renderRow: (row: any, index: number) => React.ReactNode;
}) {
  return (
    <div className="mb-[var(--space-md)]">
      {title && (
        <div className="mb-[var(--space-xs)] text-left font-bold text-[var(--ink)] text-[var(--text-sm)]">{title}</div>
      )}
      {rows.length === 0 ? (
        <div className="text-[var(--gray-5)] text-[var(--text-xs)]">No data</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[var(--text-xs)]">
            <thead>
              <tr className="border-b border-[var(--gray-7)] text-[var(--gray-4)]">
                {headers.map((h, i) => (
                  <th key={i} className="px-[var(--space-sm)] py-[var(--space-xs)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
