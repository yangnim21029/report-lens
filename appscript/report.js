// @ts-nocheck
// Google Apps Script to run inside a bound Spreadsheet project
// Reads URLs from a specific sheet (TARGET_SHEET_NAME), calls your Report API,
// and writes the result to column B.

// --- 設定區 (Configuration) ---
// 請在此處設定您要處理的 Google Sheet 分頁（Tab）名稱
const TARGET_SHEET_NAME = 'testapi';

// For quick reference in the sheet, annotate
// which backend route handles each column output.
// B column (suggestion): /api/report/context-vector
// C column (analysis):   /api/optimize/analyze
// A column (input URL search metadata): /api/search/by-url
const PATH_CONTEXT_VECTOR = '/api/report/context-vector';
const PATH_ANALYZE = '/api/optimize/analyze';
const PATH_SEARCH_BY_URL = '/api/search/by-url';


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

const DEBUG = true;
function dlog(msg) {
  if (!DEBUG) return;
  try { Logger.log(String(msg)); } catch (e) {}
}
function trunc(s, n) {
  s = String(s || '');
  if (s.length <= (n || 200)) return s;
  return s.slice(0, n || 200) + '...';
}

/**
 * Gets the specific sheet defined by TARGET_SHEET_NAME.
 * Returns the sheet object or null if not found.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getTargetSheet_() {
  if (!TARGET_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('錯誤：請在腳本頂端的 TARGET_SHEET_NAME 指定要處理的分頁名稱。');
    return null;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`錯誤：找不到名為 "${TARGET_SHEET_NAME}" 的分頁。請檢查名稱是否拼寫正確。`);
    return null;
  }
  return sheet;
}


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RepostLens')
    .addItem(`處理所有列 (${TARGET_SHEET_NAME})`, 'runForSheet')
    .addItem(`處理當前列 (${TARGET_SHEET_NAME})`, 'runForActiveRow')
    .addToUi();
  dlog('[onOpen] REPORT_API_BASE=' + REPORT_API_BASE);
}

function runForSheet() {
  const sheet = getTargetSheet_();
  if (!sheet) return; // Stop if sheet not found

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(`分頁 "${TARGET_SHEET_NAME}" 中沒有資料列（從第2列開始）。`);
    return;
  }
  for (let r = 2; r <= lastRow; r++) {
    processRow_(sheet, r);
  }
}

function runForActiveRow() {
  const targetSheet = getTargetSheet_();
  if (!targetSheet) return;

  const activeSheet = SpreadsheetApp.getActiveSheet();
  const activeCell = activeSheet.getActiveCell();

  // Ensure the user is on the correct sheet before processing the active row
  if (activeSheet.getName() !== targetSheet.getName()) {
    SpreadsheetApp.getUi().alert(`請先點選到 "${TARGET_SHEET_NAME}" 分頁，然後再執行此功能。`);
    return;
  }

  const row = activeCell.getRow();
  if (row < 2) {
     SpreadsheetApp.getUi().alert('請選擇資料列（從第2列開始）。');
    return;
  }
  processRow_(targetSheet, row);
}

/**
 * Core logic to process a single row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet object.
 * @param {number} row The row number to process.
 */
function processRow_(sheet, row) {
  const bValue = String(sheet.getRange(row, 2).getValue() || '').trim();
  const cValue = String(sheet.getRange(row, 3).getValue() || '').trim();

  if (bValue && cValue) {
    dlog(`[processRow_] skip row=${row} because columns B and C already have content.`);
    return;
  }

  const rawValue = String(sheet.getRange(row, 1).getValue() || '').trim();
  const url = normalizeUrl_(rawValue);

  if (!url || !isLikelyUrl_(url)) {
    dlog(`[processRow_] skip row=${row} not a valid URL: "${rawValue}"`);
    sheet.getRange(row, 2).setValue('SKIP: 不是有效的 URL');
    return;
  }

  sheet.getRange(row, 1).setValue(url);

  try {
    dlog(`[processRow_] row=${row} raw="${rawValue}" url="${url}"`);
    let analysis = String(sheet.getRange(row, 3).getValue() || ''); // C column optional
    if (!analysis) {
      const host = parseHostnameFromUrl_(url);
      if (!host) throw new Error('無法從 URL 中解析主機名稱');
      const site = 'sc-domain:' + host.replace(/^www\./, '');
      dlog(`[processRow_] derive site=${site}`);
      const searchRow = callSearchByUrl_(site, url);
      dlog(`[processRow_] searchRow found=${!!searchRow}`);
      if (searchRow) {
        try { sheet.getRange(row, 1).setNote('Source: ' + PATH_SEARCH_BY_URL); } catch (_) {}
        const analysisText = callOptimizeAnalyze_(searchRow);
        dlog(`[processRow_] analyze length=${(analysisText || '').length} sample=${trunc(analysisText, 180)}`);
        if (analysisText) {
          analysis = analysisText;
          const cCell = sheet.getRange(row, 3);
          cCell.setValue(analysisText); // write back to C
          try { cCell.setNote('Source: ' + PATH_ANALYZE); } catch (_) {}
        }
      }
    }
    dlog(`[processRow_] call report with analysis length=${(analysis || '').length}`);
    const suggestion = callReportApi_(url, analysis || '');
    dlog(`[processRow_] suggestion length=${(suggestion || '').length} sample=${trunc(suggestion, 180)}`);
    const bCell = sheet.getRange(row, 2);
    bCell.setValue(suggestion);
    try { bCell.setNote('Source: ' + PATH_CONTEXT_VECTOR); } catch (_) {}
    if (row < sheet.getLastRow()) {
      Utilities.sleep(800); // simple rate-limit, don't sleep on the last row
    }
  } catch (e) {
    const errorMessage = e && e.message ? e.message : String(e);
    dlog(`[processRow_] ERROR row=${row} ${errorMessage}`);
    sheet.getRange(row, 2).setValue(`ERROR: ${errorMessage}`);
  }
}


// --- API呼叫與輔助函式 (以下無需修改，除了被修正的 parseHostnameFromUrl_) ---

function callSearchByUrl_(site, pageUrl) {
  const base = getReportBase_();
  const endpoint = base + '/api/search/by-url';
  const body = JSON.stringify({ site: String(site || ''), page: String(pageUrl || '').replace(/\s+/g, '') });
  const res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true });
  dlog(`[callSearchByUrl_] endpoint=${endpoint}`);
  dlog(`[callSearchByUrl_] rc=${res.getResponseCode()} bodySample=${trunc(res.getContentText(), 180)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`search.by-url 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 120)}`);
  }
  const data = safeJson_(res.getContentText());
  dlog(`[callSearchByUrl_] rowsCount=${Array.isArray(data) ? data.length : 0}`);
  return (Array.isArray(data) && data.length > 0) ? data[0] : null;
}

function callOptimizeAnalyze_(row) {
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
  const endpoint = base + '/api/optimize/analyze';
  const body = JSON.stringify(input);
  const res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true });
  dlog(`[callOptimizeAnalyze_] endpoint=${endpoint}`);
  dlog(`[callOptimizeAnalyze_] rc=${res.getResponseCode()} bodySample=${trunc(res.getContentText(), 180)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`optimize.analyze 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 120)}`);
  }
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) {
    throw new Error(`optimize.analyze 回傳失敗`);
  }
  dlog(`[callOptimizeAnalyze_] ok analysis length=${(json.analysis || '').length}`);
  return String(json.analysis || '');
}

function callReportApi_(pageUrl, analysisText) {
  const base = getReportBase_();
  const endpoint = base + '/api/report/context-vector';
  const body = JSON.stringify({ analysisText: String(analysisText || ''), pageUrl: String(pageUrl || '').replace(/\s+/g, '') });
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    muteHttpExceptions: true,
  });
  dlog(`[callReportApi_] endpoint=${endpoint}`);
  dlog(`[callReportApi_] rc=${res.getResponseCode()} bodySample=${trunc(res.getContentText(), 180)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`Report API 錯誤: HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
  }
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) {
    const err = (json && json.error) || 'unknown error';
    throw new Error(`Report API 回傳失敗: ${err}`);
  }
  dlog(`[callReportApi_] ok content length=${(json.content || '').length} sample=${trunc(json.content, 180)}`);
  return json.content || '（無輸出）';
}


function getReportBase_() {
  if (!REPORT_API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE（不可為 localhost）');
  const base = REPORT_API_BASE.replace(/\/$/, '');
  dlog('[getReportBase_] ' + base);
  return base;
}

function toNumberOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// *** THE MAIN FIX IS HERE ***
// Replaced new URL() with a more robust regex-based parser.
function parseHostnameFromUrl_(s) {
  const match = String(s).match(/^https?:\/\/([^\/?#]+)/i);
  // The hostname is in the first capturing group (index 1)
  return match ? match[1] : null;
}

function isLikelyUrl_(s) {
  if (!s) return false;
  const str = String(s).trim();
  if (str.startsWith('#')) return false;
  if (!str.startsWith('http://') && !str.startsWith('https://')) return false;
  // This check now uses the robust parser and will succeed.
  return !!parseHostnameFromUrl_(str);
}

function normalizeUrl_(s) {
  let v = String(s || '').trim();
  v = v.replace(/[\s\u00A0]+$/g, '');
  v = v.replace(/[\,\uFF0C\u3001\;\uFF1B\u3002]+$/g, '');
  v = v.replace(/^["']+|["']+$/g, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) {
    if (v.includes('.') && !v.includes(' ')) {
      v = 'https://' + v;
      dlog(`[normalizeUrl_] Added https:// protocol to: ${v}`);
    }
  }

  // To handle both encoded and decoded URL inputs, first decode the URI.
  // This standardizes the string before re-encoding.
  let decodedUrl = v;
  try {
    // decodeURI will handle strings that are already partially or fully encoded.
    // If it's a plain string, it will remain unchanged.
    decodedUrl = decodeURI(v);
  } catch (e) {
    // This might happen with malformed URIs (e.g., a stray '%').
    // We can log it but proceed with the original string.
    dlog(`[normalizeUrl_] URI decoding failed for "${v}". Proceeding with original value. Error: ${e.message}`);
  }

  // Now, re-encode the entire URI to ensure it's safe for API calls.
  // encodeURI correctly handles special characters in paths and query parameters
  // while preserving the URL structure (e.g., keeps ':', '/', '?').
  try {
    const encodedUrl = encodeURI(decodedUrl);
    if (v !== encodedUrl) {
      dlog(`[normalizeUrl_] URL was encoded. Original: "${v}", Encoded: "${encodedUrl}"`);
    }
    return encodedUrl;
  } catch (e) {
    dlog(`[normalizeUrl_] URI encoding failed for "${decodedUrl}". Returning decoded value. Error: ${e.message}`);
    return decodedUrl; // Fallback to the decoded URL if encoding fails.
  }
}

function safeJson_(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}