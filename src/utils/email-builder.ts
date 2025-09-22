import { extractAnalysisData } from "~/utils/extract-format-html";

const LOGO_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="36" viewBox="0 0 140 36"><rect width="140" height="36" rx="8" fill="#1F2937"/><text x="20" y="23" fill="#F9FAFB" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700">RepostLens</text></svg>',
  );

type KeywordStats = {
  rank?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  searchVolume?: number | null;
};

interface BuildEmailParams {
  pageUrl: string;
  bestQuery: string;
  analysisText: string;
  apiAnalysis: any;
  contextVector: string;
  outline: string;
}

export function buildEmailHtml({
  pageUrl,
  bestQuery,
  analysisText,
  apiAnalysis,
  contextVector,
  outline,
}: BuildEmailParams): string {
  const extracted = extractAnalysisData(analysisText, { page: pageUrl, best_query: bestQuery });

  const topKeywordEntries: string[] = [];
  const seenKeywords = new Set<string>();
  const pushKeyword = (keyword: string, stats: KeywordStats) => {
    if (!keyword) return;
    const key = keyword.trim().toLowerCase();
    if (key && seenKeywords.has(key)) return;
    if (key) seenKeywords.add(key);
    topKeywordEntries.push(formatKeywordWithMetrics(keyword, stats));
  };

  const topKeywords = Array.isArray(apiAnalysis?.topRankKeywords) ? apiAnalysis.topRankKeywords : [];
  const relatedKeywordsSource = Array.isArray(apiAnalysis?.rankKeywords) ? apiAnalysis.rankKeywords : [];

  if (bestQuery) {
    const bestStats =
      topKeywords.find((item: any) => (item?.keyword || "").toLowerCase() === bestQuery.toLowerCase()) || null;
    pushKeyword(bestQuery, {
      rank: bestStats?.rank ?? apiAnalysis?.bestQueryPosition ?? null,
      clicks: bestStats?.clicks ?? apiAnalysis?.bestQueryClicks ?? null,
      impressions: bestStats?.impressions ?? null,
      searchVolume: bestStats?.searchVolume ?? null,
    });
  }

  topKeywords.forEach((item: any) => {
    if (!item?.keyword) return;
    pushKeyword(String(item.keyword), {
      rank: item.rank,
      clicks: item.clicks,
      impressions: item.impressions,
      searchVolume: item.searchVolume,
    });
  });

  const relatedKeywordEntries: string[] = [];
  const relatedSeen = new Set<string>(Array.from(seenKeywords));
  relatedKeywordsSource.forEach((item: any) => {
    if (!item?.keyword) return;
    const key = String(item.keyword).trim();
    if (!key) return;
    const normalized = key.toLowerCase();
    if (relatedSeen.has(normalized)) return;
    relatedSeen.add(normalized);
    relatedKeywordEntries.push(
      formatKeywordWithMetrics(key, {
        rank: item.rank,
        clicks: item.clicks,
        impressions: item.impressions,
        searchVolume: item.searchVolume,
      }),
    );
  });

  const heroTitle = bestQuery ? `關鍵字優化提案：${escapeHtml(bestQuery)}` : "關鍵字優化提案";
  const strategyLabel = extracted.strategy === "NEW POST" ? "建議新增文章" : "建議優化現有文章";
  const bestOpportunity = extracted.bestOpportunity ? escapeHtml(extracted.bestOpportunity) : "";

  const keywordsSection = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td valign="top" style="width:50%;padding-right:12px;">
          <p style="margin:0 0 8px;font-weight:600;color:#101828;">主要關鍵字</p>
          ${renderKeywordList(topKeywordEntries)}
        </td>
        <td valign="top" style="width:50%;padding-left:12px;">
          <p style="margin:0 0 8px;font-weight:600;color:#101828;">相關關鍵字</p>
          ${renderKeywordList(relatedKeywordEntries)}
        </td>
      </tr>
    </table>`;

  const introHtml = `
    <tr>
      <td style="padding:28px 32px 12px 32px;">
        <h1 style="margin:0 0 12px;font-size:24px;color:#101828;">${heroTitle}</h1>
        <p style="margin:0 0 8px;color:#475467;font-size:14px;">頁面：<a href="${escapeHtml(pageUrl)}" style="color:#1D4ED8;text-decoration:none;">${escapeHtml(pageUrl)}</a></p>
        <p style="margin:0 0 8px;color:#475467;font-size:14px;">策略方向：<strong>${escapeHtml(strategyLabel)}</strong></p>
        ${bestOpportunity ? `<p style="margin:0;color:#101828;font-size:14px;">核心機會：${bestOpportunity}</p>` : ""}
      </td>
    </tr>`;

  const keywordsHtml = `
    <tr>
      <td style="padding:16px 32px 0 32px;">
        ${keywordsSection}
      </td>
    </tr>`;

  const headerHtml = `
    <tr>
      <td style="padding:24px;background:#101828;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td><img src="${LOGO_DATA_URI}" alt="PressLogic RepostLens" style="height:28px;display:block;" /></td>
            <td style="text-align:right;color:#D0D5DD;font-size:12px;">${escapeHtml(new Date().toLocaleDateString("zh-TW"))}</td>
          </tr>
        </table>
      </td>
    </tr>`;

  const contextVectorHtml = renderContextVectorHtml(contextVector);
  const outlineHtml = renderOutlineSuggestion(outline);
  const outlineSection = outlineHtml
    ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #E4E7EC;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#1D4ED8;">建議文章大綱</h3>
        ${outlineHtml}
      </div>`
    : "";

  const footerHtml = `
    <tr>
      <td style="padding:16px 32px;background:#F1F5F9;color:#98A2B3;font-size:12px;text-align:center;">© ${new Date().getFullYear()} PressLogic · RepostLens</td>
    </tr>`;

  return `
<table align="center" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #EAECF0;border-radius:16px;overflow:hidden;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#101828;">
  ${headerHtml}
  ${introHtml}
  ${keywordsHtml}
  <tr>
    <td style="padding:0 32px 32px 32px;">
      <div style="background:#F9FAFB;border:1px solid #EAECF0;border-radius:12px;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#101828;">內容調整建議（Context Vector）</h2>
        ${contextVectorHtml}
        ${outlineSection}
      </div>
    </td>
  </tr>
  ${footerHtml}
</table>
`.trim();
}

function formatKeywordWithMetrics(keyword: string, stats: KeywordStats): string {
  const metrics: string[] = [];
  const rank = normalizeNumber(stats.rank);
  const clicks = normalizeNumber(stats.clicks);
  const impressions = normalizeNumber(stats.impressions);
  const sv = normalizeNumber(stats.searchVolume);
  if (rank !== null) metrics.push(`排名 ${rank}`);
  if (clicks !== null) metrics.push(`點擊 ${clicks}`);
  if (impressions !== null) metrics.push(`曝光 ${impressions}`);
  if (sv !== null) metrics.push(`SV ${sv}`);
  return metrics.length ? `${keyword}（${metrics.join(" / ")}）` : keyword;
}

function normalizeNumber(value: unknown): string | null {
  let numeric: number | null = null;
  if (typeof value === "number" && isFinite(value)) {
    numeric = value;
  } else if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (isFinite(parsed)) numeric = parsed;
  }
  if (numeric === null) return null;
  return new Intl.NumberFormat("zh-TW").format(Math.round(numeric));
}

function renderKeywordList(items: string[]): string {
  if (!items.length) {
    return '<p style="margin:0;color:#667085;font-size:13px;">無</p>';
  }
  return `<ul style="margin:0;padding-left:18px;color:#101828;font-size:13px;">${items
    .map((item) => `<li style="margin-bottom:4px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderContextVectorHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return '<p style="margin:0;color:#667085;font-size:13px;">目前沒有額外建議。</p>';
  }
  if (trimmed.startsWith("|") || trimmed.includes("|")) {
    const table = convertMarkdownTableToHtml(trimmed);
    if (table) {
      return `<div style="overflow-x:auto;">${table}</div>`;
    }
  }

  const lines = trimmed.replace(/\r?\n/g, "\n").split("\n");
  const htmlParts: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    htmlParts.push(
      `<ul style="margin:0;padding-left:18px;color:#101828;font-size:13px;">${listBuffer
        .map((item) => `<li style="margin-bottom:6px;">${item}</li>`)
        .join("")}</ul>`,
    );
    listBuffer = [];
  };

  const formatInline = (text: string) => {
    let working = text.replace(/<br\s*\/?>(?=\s|$)/gi, () => "__BR__");
    working = escapeHtml(working);
    working = working.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    working = working.replace(/__BR__/g, "<br />");
    return working;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      const contentPart = line.replace(/^[-*]\s+/, "");
      listBuffer.push(formatInline(contentPart));
      return;
    }
    flushList();
    htmlParts.push(`<p style="margin:0 0 10px;color:#101828;font-size:13px;">${formatInline(line)}</p>`);
  });

  flushList();
  if (!htmlParts.length) {
    return `<p style="margin:0;color:#101828;font-size:13px;">${escapeHtml(trimmed)}</p>`;
  }
  return htmlParts.join("");
}

function renderOutlineSuggestion(outline: string): string {
  const trimmed = outline.trim();
  if (!trimmed) return "";

  return `<pre style="margin:0;font-size:13px;color:#475467;white-space:pre-wrap;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;line-height:1.6;">${escapeHtml(trimmed)}</pre>`;
}

function convertMarkdownTableToHtml(markdown: string): string | null {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  if (!headerLine || !headerLine.includes("|")) return null;
  const separatorIndex = lines.findIndex(
    (line, idx) => idx > 0 && /^\|?\s*:?\-+:?\s*(\|\s*:?\-+:?\s*)*\|?$/.test(line),
  );
  if (separatorIndex === -1) return null;

  const headerCells = splitMarkdownRow(headerLine);
  if (!headerCells.length) return null;

  const bodyLines = lines.slice(separatorIndex + 1).filter((line) => line.includes("|"));
  const headerHtml = `<tr>${headerCells
    .map((cell) => `<th style="background:#F9FAFB;padding:10px 12px;border:1px solid #E4E7EC;text-align:left;font-size:13px;color:#101828;">${escapeHtml(cell)}</th>`)
    .join("")}</tr>`;

  const bodyHtml = bodyLines
    .map((line) => {
      const cells = splitMarkdownRow(line);
      return `<tr>${cells
        .map(
          (cell) =>
            `<td style="padding:8px 12px;border:1px solid #E4E7EC;font-size:13px;color:#475467;">${escapeHtml(cell)}</td>`,
        )
        .join("")}</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;">${headerHtml}${bodyHtml}</table>`;
}

function splitMarkdownRow(row: string): string[] {
  const cells = row.split("|").map((cell) => cell.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
