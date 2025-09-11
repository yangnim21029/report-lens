// @ts-nocheck
// Google Apps Script to run inside a bound Spreadsheet project
// Reads URLs from column A and calls your Report API (tRPC)
// to generate the context-vector suggestion, then writes to column B.

// IMPORTANT: Apps Script cannot call localhost. Set this to your reachable domain.
// Go to: Extensions → Apps Script → Project Settings → Script properties, and add REPORT_API_BASE
// Example: https://report-lens.yourdomain.com
const REPORT_API_BASE = (function () {
  try {
    return PropertiesService.getScriptProperties().getProperty('REPORT_API_BASE') || '';
  } catch (e) {
    return '';
  }
})();

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RepostLens')
    .addItem('Run A → B (all rows)', 'runForSheet')
    .addItem('Run A → B (active row)', 'runForActiveRow')
    .addToUi();
}

function runForSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('沒有資料列（從第2列開始）。');
    return;
  }
  for (let r = 2; r <= lastRow; r++) {
    const url = String(sheet.getRange(r, 1).getValue() || '').trim();
    if (!url) continue;
    try {
      let analysis = String(sheet.getRange(r, 3).getValue() || ''); // C column optional
      if (!analysis) {
        // Derive site for search router (sc-domain:host)
        const site = 'sc-domain:' + new URL(url).hostname.replace(/^www\./, '');
        const searchRow = callSearchByUrl_(site, url);
        if (searchRow) {
          const analysisText = callOptimizeAnalyze_(searchRow);
          if (analysisText) {
            analysis = analysisText;
            sheet.getRange(r, 3).setValue(analysisText); // write back to C
          }
        }
      }
      const suggestion = callReportApi_(url, analysis || '');
      sheet.getRange(r, 2).setValue(suggestion);
      Utilities.sleep(800); // simple rate-limit
    } catch (e) {
      sheet.getRange(r, 2).setValue(`ERROR: ${e && e.message ? e.message : e}`);
    }
  }
}

function runForActiveRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  const url = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!url) {
    SpreadsheetApp.getUi().alert('請在 A 欄選擇有 URL 的列');
    return;
  }
  try {
    let analysis = String(sheet.getRange(row, 3).getValue() || ''); // C column
    if (!analysis) {
      const site = 'sc-domain:' + new URL(url).hostname.replace(/^www\./, '');
      const searchRow = callSearchByUrl_(site, url);
      if (searchRow) {
        const analysisText = callOptimizeAnalyze_(searchRow);
        if (analysisText) {
          analysis = analysisText;
          sheet.getRange(row, 3).setValue(analysisText);
        }
      }
    }
    const suggestion = callReportApi_(url, analysis || '');
    sheet.getRange(row, 2).setValue(suggestion);
  } catch (e) {
    sheet.getRange(row, 2).setValue(`ERROR: ${e && e.message ? e.message : e}`);
  }
}

function callSearchByUrl_(site, pageUrl) {
  const base = getReportBase_();
  const endpoint = base + '/api/trpc/search.getSearchDataByUrl?batch=1';
  const body = JSON.stringify({ 0: { json: { site: String(site || ''), page: String(pageUrl || '') } } });
  const res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`search.getSearchDataByUrl 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 120)}`);
  }
  const data = safeJson_(res.getContentText());
  const item = Array.isArray(data) ? data[0] : null;
  const rows = item && item.result && item.result.data && item.result.data.json;
  return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
}

function callOptimizeAnalyze_(row) {
  // Map search row to optimize.analyzeContent input
  const input = {
    page: String(row.page || ''),
    bestQuery: row.best_query || null,
    bestQueryClicks: toNumberOrNull_(row.best_query_clicks),
    bestQueryPosition: toNumberOrNull_(row.best_query_position),
    prevBestQuery: row.prev_best_query || null,
    prevBestPosition: toNumberOrNull_(row.prev_best_position),
    prevBestClicks: toNumberOrNull_(row.prev_best_clicks),
    rank4: row.rank_4 || null,
    rank5: row.rank_5 || null,
    rank6: row.rank_6 || null,
    rank7: row.rank_7 || null,
    rank8: row.rank_8 || null,
    rank9: row.rank_9 || null,
    rank10: row.rank_10 || null,
  };
  const base = getReportBase_();
  const endpoint = base + '/api/trpc/optimize.analyzeContent?batch=1';
  const body = JSON.stringify({ 0: { json: input } });
  const res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`optimize.analyzeContent 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 120)}`);
  }
  const data = safeJson_(res.getContentText());
  const item = Array.isArray(data) ? data[0] : null;
  const json = item && item.result && item.result.data && item.result.data.json;
  if (!json || json.success !== true) {
    throw new Error(`analyzeContent 回傳失敗`);
  }
  return String(json.analysis || '');
}

function callReportApi_(pageUrl, analysisText) {
  const base = getReportBase_();
  const endpoint = base + '/api/trpc/report.generateContextVector?batch=1';
  const body = JSON.stringify({
    0: {
      json: {
        analysisText: String(analysisText || ''),
        pageUrl: String(pageUrl || ''),
      },
    },
  });
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`Report API 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
  }
  const data = safeJson_(res.getContentText());
  // tRPC batch response: array with first element
  const item = Array.isArray(data) ? data[0] : null;
  const json = item && item.result && item.result.data && item.result.data.json;
  if (!json || json.success !== true) {
    const err = (json && json.error) || 'unknown error';
    throw new Error(`Report API 回傳失敗: ${err}`);
  }
  return json.content || '（無輸出）';
}

function getReportBase_() {
  if (!REPORT_API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE（不可為 localhost）');
  return REPORT_API_BASE.replace(/\/$/, '');
}

function toNumberOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeJson_(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
