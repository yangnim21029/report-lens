// @ts-nocheck
// Google Apps Script entrypoint for RepostLens automation (condensed version)
const TARGET_SHEET_NAME = 'testapi';
const PATH_CONTEXT_VECTOR = '/api/report/context-vector';
const PATH_CONTEXT_VECTOR_BATCH = '/api/report/context-vector-batch';
const PATH_ANALYZE = '/api/optimize/analyze';
const PATH_SEARCH_BY_URL = '/api/search/by-url';
const PATH_OUTLINE = '/api/report/outline';
const PATH_OUTLINE_BATCH = '/api/report/outline-batch';
const COL_URL = 1, COL_CONTEXT_VECTOR = 2, COL_ANALYSIS = 3, COL_DOC_BODY = 4, COL_DOC_LINK = 5, COL_REGENERATED = 6;
const REPORT_API_BASE = (function () {
  try { return PropertiesService.getScriptProperties().getProperty('REPORT_API_BASE') || ''; }
  catch (e) { return ''; }
})();
const DEBUG = true;
function dlog(msg) { if (DEBUG) try { Logger.log(String(msg)); } catch (e) { } }
function trunc(s, n) { s = String(s || ''); return s.length <= (n || 200) ? s : s.slice(0, n || 200) + '...'; }

// function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('RepostLens')
//     .addItem(`AI開優化建議(所有列) (${TARGET_SHEET_NAME})`, 'runForSheet')
//     .addItem(`AI開優化建議(當前列) (${TARGET_SHEET_NAME})`, 'runForActiveRow')
//     .addToUi();
//   dlog('[onOpen] REPORT_API_BASE=' + REPORT_API_BASE);
// }

function getTargetSheet_() {
  if (!TARGET_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('請先設定 TARGET_SHEET_NAME');
    return null;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`找不到分頁 "${TARGET_SHEET_NAME}"`);
    return null;
  }
  return sheet;
}
function runForSheet() {
  const sheet = getTargetSheet_();
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(`分頁 "${TARGET_SHEET_NAME}" 沒有資料列`);
    return;
  }
  for (let row = 2; row <= lastRow; row += 1) {
    processRow_(sheet, row);
  }
}

function regenerateSheetUsingStoredAnalysis() {
  const sheet = getTargetSheet_();
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(`分頁 "${TARGET_SHEET_NAME}" 沒有資料列`);
    return;
  }
  const ui = SpreadsheetApp.getActive();
  for (let row = 2; row <= lastRow; row += 1) {
    ui.toast(`重新生成第 ${row} 列`, 'RepostLens', 2);
    regenerateRowUsingStoredAnalysis_(sheet, row);
    SpreadsheetApp.flush(); // 立即寫入，避免長時間執行當機
    if (row < lastRow) Utilities.sleep(600);
  }
  ui.toast('重新生成完成', 'RepostLens', 3);
}

function regenerateSheetUsingStoredAnalysisBatch() {
  const sheet = getTargetSheet_();
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(`分頁 "${TARGET_SHEET_NAME}" 沒有資料列`);
    return;
  }

  const BATCH_SIZE = 10;
  const ui = SpreadsheetApp.getActive();

  // 收集所有需要處理的列
  const rowsToProcess = [];
  for (let row = 2; row <= lastRow; row += 1) {
    const regeneratedCell = sheet.getRange(row, COL_REGENERATED);
    const regeneratedFlag = String(regeneratedCell.getValue() || '').trim();
    if (regeneratedFlag !== 'REGENERATED') {
      rowsToProcess.push(row);
    }
  }

  if (rowsToProcess.length === 0) {
    ui.toast('所有列都已處理完成', 'RepostLens', 3);
    return;
  }

  ui.toast(`準備批次處理 ${rowsToProcess.length} 列`, 'RepostLens', 3);

  // 分批處理
  for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
    const batch = rowsToProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rowsToProcess.length / BATCH_SIZE);

    ui.toast(`處理批次 ${batchNum}/${totalBatches} (列 ${batch.join(', ')})`, 'RepostLens', 3);

    // 批次呼叫 API
    const batchResult = regenerateBatchRows_(sheet, batch);

    ui.toast(`批次 ${batchNum} 完成：成功 ${batchResult.success}，失敗 ${batchResult.failed}`, 'RepostLens', 3);

    SpreadsheetApp.flush();

    // 批次間休息
    if (i + BATCH_SIZE < rowsToProcess.length) {
      Utilities.sleep(1000);
    }
  }

  ui.toast('批次重新生成完成', 'RepostLens', 5);
}

function regenerateBatchRows_(sheet, rows) {
  const result = { success: 0, failed: 0 };

  // 準備批次資料
  const batchData = [];
  const rowMap = new Map();

  for (const row of rows) {
    const urlCell = sheet.getRange(row, COL_URL);
    const analysisCell = sheet.getRange(row, COL_ANALYSIS);

    const rawUrl = String(urlCell.getValue() || '').trim();
    const normalizedUrl = normalizeUrl_(rawUrl);

    if (!normalizedUrl || !isLikelyUrl_(normalizedUrl)) {
      result.failed += 1;
      continue;
    }

    const storedAnalyzeData = parseStoredAnalyzeResult_(analysisCell.getValue());
    const analysisText = storedAnalyzeData && typeof storedAnalyzeData.analysis === 'string'
      ? storedAnalyzeData.analysis
      : '';

    if (!analysisText) {
      result.failed += 1;
      continue;
    }

    const host = parseHostnameFromUrl_(normalizedUrl);
    if (!host) {
      result.failed += 1;
      continue;
    }

    // 先取得 searchRow
    const site = 'sc-domain:' + host.replace(/^www\./, '');
    const searchRow = callSearchByUrl_(site, normalizedUrl);

    if (!searchRow) {
      sheet.getRange(row, COL_CONTEXT_VECTOR).setValue('SKIP: search.by-url 無資料');
      result.failed += 1;
      continue;
    }

    batchData.push({
      pageUrl: normalizedUrl,
      analysisText: analysisText,
    });

    rowMap.set(normalizedUrl, {
      row,
      url: normalizedUrl,
      host,
      analyzeData: storedAnalyzeData,
      searchRow,
    });
  }

  if (batchData.length === 0) {
    return result;
  }

  // 批次呼叫 context-vector API
  let contextResults = [];
  try {
    contextResults = callReportApiBatch_(batchData);
  } catch (err) {
    dlog(`[regenerateBatchRows_] context-vector batch failed: ${err.message}`);
    // 降級為逐一處理
    for (const item of batchData) {
      try {
        const singleResult = callReportApi_(item.pageUrl, item.analysisText);
        contextResults.push({ pageUrl: item.pageUrl, success: true, ...singleResult });
      } catch (e) {
        contextResults.push({ pageUrl: item.pageUrl, success: false, error: e.message });
      }
    }
  }

  // 批次呼叫 outline API
  const outlineItems = batchData.map(item => ({ analysisText: item.analysisText }));
  let outlineResults = [];
  try {
    outlineResults = callOutlineApiBatch_(outlineItems);
  } catch (err) {
    dlog(`[regenerateBatchRows_] outline batch failed: ${err.message}`);
    // 降級為逐一處理
    for (const item of batchData) {
      try {
        const singleOutline = callOutlineApi_(item.analysisText);
        outlineResults.push({ success: true, outline: singleOutline });
      } catch (e) {
        outlineResults.push({ success: false, error: e.message });
      }
    }
  }

  // 處理結果並寫入 sheet
  for (let i = 0; i < batchData.length; i += 1) {
    const batchItem = batchData[i];
    const contextResult = contextResults[i];
    const outlineResult = outlineResults[i];
    const rowData = rowMap.get(batchItem.pageUrl);

    if (!rowData) continue;

    try {
      const contextCell = sheet.getRange(rowData.row, COL_CONTEXT_VECTOR);
      const docBodyCell = sheet.getRange(rowData.row, COL_DOC_BODY);
      const docLinkCell = sheet.getRange(rowData.row, COL_DOC_LINK);
      const regeneratedCell = sheet.getRange(rowData.row, COL_REGENERATED);

      if (!contextResult || !contextResult.success) {
        contextCell.setValue(`ERROR: ${contextResult?.error || 'context-vector failed'}`);
        result.failed += 1;
        continue;
      }

      if (!outlineResult || !outlineResult.success) {
        contextCell.setValue(`ERROR: ${outlineResult?.error || 'outline failed'}`);
        result.failed += 1;
        continue;
      }

      deleteDocumentFromCell_(docLinkCell);
      docBodyCell.clearContent();

      const docSections = prepareDocSections_({
        pageUrl: rowData.url,
        searchRow: rowData.searchRow,
        outline: outlineResult.outline || '',
        analyzeData: rowData.analyzeData,
        contextResult: {
          suggestions: contextResult.suggestions || [],
          markdown: contextResult.markdown || '',
        },
      });

      const contextText = buildAdjustmentsPreviewText_(docSections.adjustmentsTable);
      contextCell.setValue(contextText);

      const docPreview = buildDocPreviewText_(docSections);
      docBodyCell.setValue(docPreview);

      const docName = `RepostLens Draft - ${rowData.searchRow.best_query || rowData.host}`;
      const docUrl = upsertDocumentWithSections_(docLinkCell, docName, docSections);
      if (docUrl) docLinkCell.setValue(docUrl);

      regeneratedCell.setValue('REGENERATED');
      result.success += 1;

    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      dlog(`[regenerateBatchRows_] ERROR row=${rowData.row} ${message}`);
      sheet.getRange(rowData.row, COL_CONTEXT_VECTOR).setValue(`ERROR: ${message}`);
      result.failed += 1;
    }
  }

  return result;
}

function callReportApiBatch_(items) {
  const endpoint = getReportBase_() + PATH_CONTEXT_VECTOR_BATCH;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ items }),
    muteHttpExceptions: true,
  });
  dlog(`[callReportApiBatch_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`context-vector-batch 錯誤: HTTP ${res.getResponseCode()}`);
  }
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) throw new Error('context-vector-batch 失敗');
  return json.results || [];
}

function callOutlineApiBatch_(items) {
  const endpoint = getReportBase_() + PATH_OUTLINE_BATCH;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ items }),
    muteHttpExceptions: true,
  });
  dlog(`[callOutlineApiBatch_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`outline-batch 錯誤: HTTP ${res.getResponseCode()}`);
  }
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) throw new Error('outline-batch 失敗');
  return json.results || [];
}
function runForActiveRow() {
  const sheet = getTargetSheet_();
  if (!sheet) return;
  const activeSheet = SpreadsheetApp.getActiveSheet();
  const activeCell = activeSheet.getActiveCell();
  if (activeSheet.getName() !== sheet.getName()) {
    SpreadsheetApp.getUi().alert(`請切換到 "${TARGET_SHEET_NAME}" 分頁再執行`);
    return;
  }
  const row = activeCell.getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('請選擇第2列以後的資料列');
    return;
  }
  processRow_(sheet, row);
}

function regenerateActiveRowUsingStoredAnalysis() {
  const sheet = getTargetSheet_();
  if (!sheet) return;
  const activeSheet = SpreadsheetApp.getActiveSheet();
  const activeCell = activeSheet.getActiveCell();
  if (activeSheet.getName() !== sheet.getName()) {
    SpreadsheetApp.getUi().alert(`請切換到 "${TARGET_SHEET_NAME}" 分頁再執行`);
    return;
  }
  const row = activeCell.getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('請選擇第2列以後的資料列');
    return;
  }
  regenerateRowUsingStoredAnalysis_(sheet, row);
}
function processRow_(sheet, row) {
  const urlCell = sheet.getRange(row, COL_URL);
  const contextCell = sheet.getRange(row, COL_CONTEXT_VECTOR);
  const analysisCell = sheet.getRange(row, COL_ANALYSIS);
  const docBodyCell = sheet.getRange(row, COL_DOC_BODY);
  const docLinkCell = sheet.getRange(row, COL_DOC_LINK);
  const existingDoc = String(docBodyCell.getValue() || '').trim();
  if (existingDoc) {
    dlog(`[processRow_] skip row=${row}, doc already generated`);
    return;
  }
  const rawUrl = String(urlCell.getValue() || '').trim();
  const normalizedUrl = normalizeUrl_(rawUrl);
  if (!normalizedUrl || !isLikelyUrl_(normalizedUrl)) {
    contextCell.setValue('SKIP: 非有效網址');
    return;
  }
  urlCell.setValue(normalizedUrl);
  try {
    let analyzeData = parseStoredAnalyzeResult_(analysisCell.getValue());
    let analysisText = analyzeData && typeof analyzeData.analysis === 'string' ? analyzeData.analysis : '';
    const host = parseHostnameFromUrl_(normalizedUrl);
    if (!host) throw new Error('URL 缺少 host');
    const site = 'sc-domain:' + host.replace(/^www\./, '');
    const searchRow = callSearchByUrl_(site, normalizedUrl);
    if (!searchRow) {
      contextCell.setValue('SKIP: search.by-url 無資料');
      return;
    }
    if (!analysisText) {
      const freshAnalysis = callOptimizeAnalyze_(searchRow);
      analysisText = sanitizeMultiline_(freshAnalysis.analysis || '');
      const prepared = prepareAnalyzeDataForStorage_(freshAnalysis);
      analyzeData = prepared;
      analysisCell.setValue(JSON.stringify(prepared || {}));
    }
    if (!analysisText) {
      contextCell.setValue('SKIP: 無分析內容');
      return;
    }
    const contextResult = callReportApi_(normalizedUrl, analysisText);
    const outline = callOutlineApi_(analysisText);
    const docSections = prepareDocSections_({
      pageUrl: normalizedUrl,
      searchRow,
      outline,
      analyzeData,
      contextResult,
    });
    const contextText = buildAdjustmentsPreviewText_(docSections.adjustmentsTable);
    contextCell.setValue(contextText);
    const docPreview = buildDocPreviewText_(docSections);
    docBodyCell.setValue(docPreview);
    const docName = `RepostLens Draft - ${searchRow.best_query || host}`;
    const docUrl = upsertDocumentWithSections_(docLinkCell, docName, docSections);
    if (docUrl) docLinkCell.setValue(docUrl);
    if (row < sheet.getLastRow()) Utilities.sleep(600);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    dlog(`[processRow_] ERROR row=${row} ${message}`);
    docBodyCell.setValue(`ERROR: ${message}`);
  }
}

function regenerateRowUsingStoredAnalysis_(sheet, row) {
  const urlCell = sheet.getRange(row, COL_URL);
  const contextCell = sheet.getRange(row, COL_CONTEXT_VECTOR);
  const analysisCell = sheet.getRange(row, COL_ANALYSIS);
  const docBodyCell = sheet.getRange(row, COL_DOC_BODY);
  const docLinkCell = sheet.getRange(row, COL_DOC_LINK);
  const regeneratedCell = sheet.getRange(row, COL_REGENERATED);

  // 檢查是否已經重新渲染過
  const regeneratedFlag = String(regeneratedCell.getValue() || '').trim();
  if (regeneratedFlag === 'REGENERATED') {
    dlog(`[regenerateRowUsingStoredAnalysis_] skip row=${row}, already regenerated`);
    return;
  }

  const rawUrl = String(urlCell.getValue() || '').trim();
  const normalizedUrl = normalizeUrl_(rawUrl);
  if (!normalizedUrl || !isLikelyUrl_(normalizedUrl)) {
    contextCell.setValue('SKIP: 非有效網址');
    return;
  }
  urlCell.setValue(normalizedUrl);

  const storedAnalysisRaw = analysisCell.getValue();
  const storedAnalyzeData = parseStoredAnalyzeResult_(storedAnalysisRaw);
  const analysisText = storedAnalyzeData && typeof storedAnalyzeData.analysis === 'string'
    ? storedAnalyzeData.analysis
    : '';

  if (!analysisText) {
    contextCell.setValue('SKIP: C 欄缺少分析內容，請先執行 ANALYZE');
    return;
  }

  const host = parseHostnameFromUrl_(normalizedUrl);
  if (!host) {
    contextCell.setValue('SKIP: 無法解析網址 host');
    return;
  }

  const site = 'sc-domain:' + host.replace(/^www\./, '');

  try {
    contextCell.setValue('重新生成中...');
    SpreadsheetApp.flush();

    const searchRow = callSearchByUrl_(site, normalizedUrl);
    if (!searchRow) {
      contextCell.setValue('SKIP: search.by-url 無資料');
      return;
    }

    deleteDocumentFromCell_(docLinkCell);
    docBodyCell.clearContent();

    const contextResult = callReportApi_(normalizedUrl, analysisText);
    const outline = callOutlineApi_(analysisText);

    const docSections = prepareDocSections_({
      pageUrl: normalizedUrl,
      searchRow,
      outline,
      analyzeData: storedAnalyzeData,
      contextResult,
    });

    const contextText = buildAdjustmentsPreviewText_(docSections.adjustmentsTable);
    contextCell.setValue(contextText);

    const docPreview = buildDocPreviewText_(docSections);
    docBodyCell.setValue(docPreview);

    const docName = `RepostLens Draft - ${searchRow.best_query || host}`;
    const docUrl = upsertDocumentWithSections_(docLinkCell, docName, docSections);
    if (docUrl) docLinkCell.setValue(docUrl);

    // 標記為已重新渲染
    regeneratedCell.setValue('REGENERATED');

  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    dlog(`[regenerateRowUsingStoredAnalysis_] ERROR row=${row} ${message}`);
    contextCell.setValue(`ERROR: ${message}`);
    docBodyCell.setValue(`ERROR: ${message}`);
  }
}
function callSearchByUrl_(site, pageUrl) {
  const endpoint = getReportBase_() + PATH_SEARCH_BY_URL;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ site, page: String(pageUrl || '').replace(/\s+/g, '') }),
    muteHttpExceptions: true,
  });
  dlog(`[callSearchByUrl_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`search.by-url 錯誤: HTTP ${res.getResponseCode()}`);
  }
  const data = safeJson_(res.getContentText());
  return Array.isArray(data) && data.length ? data[0] : null;
}
function callOptimizeAnalyze_(row) {
  const endpoint = getReportBase_() + PATH_ANALYZE;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      page: row.page,
      bestQuery: row.best_query,
      bestQueryClicks: toNumberOrNull_(row.best_query_clicks),
      bestQueryPosition: toNumberOrNull_(row.best_query_position),
      prevBestQuery: row.prev_best_query,
      prevBestPosition: toNumberOrNull_(row.prev_best_position),
      prevBestClicks: toNumberOrNull_(row.prev_best_clicks),
      rank4: row.rank_4,
      rank5: row.rank_5,
      rank6: row.rank_6,
      rank7: row.rank_7,
      rank8: row.rank_8,
      rank9: row.rank_9,
      rank10: row.rank_10,
    }),
    muteHttpExceptions: true,
  });
  dlog(`[callOptimizeAnalyze_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(`optimize.analyze 錯誤: HTTP ${res.getResponseCode()}`);
  }
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) throw new Error('optimize.analyze 失敗');
  return json;
}
function callReportApi_(pageUrl, analysisText) {
  const endpoint = getReportBase_() + PATH_CONTEXT_VECTOR;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ pageUrl: String(pageUrl || '').replace(/\s+/g, ''), analysisText }),
    muteHttpExceptions: true,
  });
  dlog(`[callReportApi_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error(`context-vector 錯誤: HTTP ${res.getResponseCode()}`);
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) throw new Error('context-vector 失敗');
  return {
    suggestions: Array.isArray(json.suggestions) ? json.suggestions : [],
    markdown: sanitizeMultiline_(json.markdown || ''),
  };
}
function callOutlineApi_(analysisText) {
  const endpoint = getReportBase_() + PATH_OUTLINE;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ analyzeResult: String(analysisText || '') }),
    muteHttpExceptions: true,
  });
  dlog(`[callOutlineApi_] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error(`outline 錯誤: HTTP ${res.getResponseCode()}`);
  const json = safeJson_(res.getContentText());
  if (!json || json.success !== true) throw new Error('outline 失敗');
  return String(json.outline || '');
}
function parseStoredAnalyzeResult_(value) {
  if (!value) return null;
  const text = sanitizeMultiline_(value);
  if (!text || text.charAt(0) !== '{') return null;
  const parsed = safeJson_(text);
  return parsed && parsed.success === true ? sanitizeAnalyzeData_(parsed) : null;
}
const MAX_ANALYSIS_CHARS = 16000;
const MAX_RANK_ROWS = 18;
const MAX_PREV_ROWS = 10;
const MAX_ZERO_ROWS = 10;
const MAX_COVERAGE_ROWS = 12;
const MAX_EXPLORER_LIST = 8;
const MAX_EXPLORER_TABLE_CHARS = 2500;
const MAX_ANALYZE_CELL = 45000;
function sanitizeAnalyzeData_(raw) {
  if (!raw || raw.success !== true) return null;
  const clip = (str, limit) => { const text = sanitizeMultiline_(str); return text.length > limit ? text.slice(0, limit) : text; };
  const mapKeywords = (rows, limit) => (Array.isArray(rows) ? rows : [])
    .slice(0, limit)
    .map((row) => {
      const keyword = sanitizeString_(row && (row.keyword || row.text));
      if (!keyword) return null;
      return {
        keyword,
        rank: toNumberOrNull_(row.rank),
        clicks: toNumberOrNull_(row.clicks),
        impressions: toNumberOrNull_(row.impressions),
        searchVolume: toNumberOrNull_(row.searchVolume),
      };
    })
    .filter(Boolean);
  const mapCoverage = (rows, limit) => (Array.isArray(rows) ? rows : [])
    .slice(0, limit)
    .map((row) => {
      const text = sanitizeString_(row && (row.text || row.keyword));
      if (!text) return null;
      const gsc = row && row.gsc ? {
        clicks: toNumberOrNull_(row.gsc.clicks),
        impressions: toNumberOrNull_(row.gsc.impressions),
        avgPosition: toNumberOrNull_(row.gsc.avgPosition),
      } : null;
      return {
        text,
        searchVolume: toNumberOrNull_(row.searchVolume),
        gsc,
      };
    })
    .filter(Boolean);
  const mapList = (rows, limit) => (Array.isArray(rows) ? rows : [])
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return sanitizeString_(item);
      return sanitizeString_(item.text || item.title || item.label || '');
    })
    .filter(Boolean)
    .slice(0, limit);
  const analysis = clip(raw.analysis || '', MAX_ANALYSIS_CHARS);
  return {
    success: true,
    analysis,
    analysisTruncated: analysis.length < sanitizeMultiline_(raw.analysis || '').length,
    keywordsAnalyzed: toNumberOrNull_(raw.keywordsAnalyzed),
    rankKeywords: mapKeywords(raw.rankKeywords, MAX_RANK_ROWS),
    topRankKeywords: mapKeywords(raw.topRankKeywords, Math.min(8, MAX_RANK_ROWS)),
    previousRankKeywords: mapKeywords(raw.previousRankKeywords, MAX_PREV_ROWS),
    zeroSearchVolumeKeywords: {
      rank: mapKeywords(raw.zeroSearchVolumeKeywords && raw.zeroSearchVolumeKeywords.rank, MAX_ZERO_ROWS),
      coverage: mapCoverage(raw.zeroSearchVolumeKeywords && raw.zeroSearchVolumeKeywords.coverage, MAX_ZERO_ROWS),
    },
    keywordCoverage: raw.keywordCoverage ? {
      covered: mapCoverage(raw.keywordCoverage.covered, MAX_COVERAGE_ROWS),
      uncovered: mapCoverage(raw.keywordCoverage.uncovered, MAX_COVERAGE_ROWS),
      zeroSearchVolume: mapCoverage(raw.keywordCoverage.zeroSearchVolume, MAX_ZERO_ROWS),
    } : null,
    contentExplorer: raw.contentExplorer ? {
      table: clip(raw.contentExplorer.table || '', MAX_EXPLORER_TABLE_CHARS),
      difficultyNotes: mapList(raw.contentExplorer.difficultyNotes, MAX_EXPLORER_LIST),
      formatNotes: mapList(raw.contentExplorer.formatNotes, MAX_EXPLORER_LIST),
      paaNotes: mapList(raw.contentExplorer.paaNotes, MAX_EXPLORER_LIST),
      pickedQueries: mapList(raw.contentExplorer.pickedQueries, MAX_EXPLORER_LIST),
      insights: mapList(raw.contentExplorer.insights, MAX_EXPLORER_LIST),
    } : null,
  };
}
function prepareAnalyzeDataForStorage_(raw) {
  let sanitized = sanitizeAnalyzeData_(raw) || { success: false };
  const shrinkers = [
    (d) => { d.analysis = ''; d.analysisTruncated = true; },
    (d) => {
      d.rankKeywords = d.rankKeywords.slice(0, 10);
      d.topRankKeywords = d.topRankKeywords.slice(0, 6);
      if (d.previousRankKeywords) d.previousRankKeywords = d.previousRankKeywords.slice(0, 6);
      if (d.zeroSearchVolumeKeywords) { d.zeroSearchVolumeKeywords.rank = d.zeroSearchVolumeKeywords.rank.slice(0, 6); d.zeroSearchVolumeKeywords.coverage = d.zeroSearchVolumeKeywords.coverage.slice(0, 4); }
      if (d.keywordCoverage) {
        d.keywordCoverage.covered = d.keywordCoverage.covered.slice(0, 8);
        d.keywordCoverage.uncovered = d.keywordCoverage.uncovered.slice(0, 8);
        d.keywordCoverage.zeroSearchVolume = d.keywordCoverage.zeroSearchVolume.slice(0, 6);
      }
      if (d.contentExplorer) {
        d.contentExplorer.table = '';
        d.contentExplorer.difficultyNotes = d.contentExplorer.difficultyNotes.slice(0, 4);
        d.contentExplorer.formatNotes = d.contentExplorer.formatNotes.slice(0, 4);
        d.contentExplorer.paaNotes = d.contentExplorer.paaNotes.slice(0, 4);
        d.contentExplorer.pickedQueries = d.contentExplorer.pickedQueries.slice(0, 4);
        d.contentExplorer.insights = d.contentExplorer.insights.slice(0, 4);
      }
    },
    (d) => {
      d.rankKeywords = [];
      d.topRankKeywords = [];
      if (d.previousRankKeywords) d.previousRankKeywords = [];
      if (d.zeroSearchVolumeKeywords) { d.zeroSearchVolumeKeywords = { rank: [], coverage: [] }; }
      d.keywordCoverage = null;
      d.contentExplorer = null;
    }
  ];
  for (let i = -1; i < shrinkers.length; i += 1) { if (i >= 0) shrinkers[i](sanitized); if (JSON.stringify(sanitized || {}).length <= MAX_ANALYZE_CELL) return sanitized; }
  return { success: sanitized.success === true, analysis: '', analysisTruncated: true };
}
function prepareDocSections_({ pageUrl, searchRow, outline, analyzeData, contextResult }) {
  const heroPage = decodeURIComponentSafe_(pageUrl);
  const heroPageUrl = String(pageUrl || '');
  const heroKeyword = searchRow && searchRow.best_query ? searchRow.best_query : '';

  const keywordSummaryTable = buildKeywordSummaryTable_(searchRow, analyzeData);
  const coverageTable = buildCoverageTableData_(analyzeData);
  const adjustmentsTable = buildAdjustmentsTableData_(contextResult);
  const outlineEntries = parseOutlineEntries_(outline);

  return {
    heroPage,
    heroPageUrl,
    heroKeyword,
    keywordSummaryTable,
    coverageTable,
    adjustmentsTable,
    outlineEntries,
  };
}

function buildKeywordSummaryTable_(searchRow, analyzeData) {
  const mainKeywords = [];
  const relatedKeywords = [];

  const pushUnique = (list, value) => {
    const text = sanitizeString_(value);
    if (!text) return;
    const lower = text.toLowerCase();
    if (list.some((item) => item.toLowerCase() === lower)) return;
    list.push(text);
  };

  if (searchRow && searchRow.best_query) {
    pushUnique(mainKeywords, searchRow.best_query);
  }

  const topRank = Array.isArray(analyzeData?.topRankKeywords) ? analyzeData.topRankKeywords : [];
  topRank.forEach((item) => pushUnique(mainKeywords, item && item.keyword));

  const rankKeywords = Array.isArray(analyzeData?.rankKeywords) ? analyzeData.rankKeywords : [];
  rankKeywords.forEach((item) => pushUnique(relatedKeywords, item && item.keyword));

  const coverageCovered = analyzeData?.keywordCoverage?.covered || [];
  coverageCovered.forEach((item) => pushUnique(relatedKeywords, item && item.text));

  const uncovered = analyzeData?.keywordCoverage?.uncovered || [];
  uncovered.forEach((item) => pushUnique(relatedKeywords, item && item.text));

  const zeroVolume = analyzeData?.zeroSearchVolumeKeywords?.rank || [];
  zeroVolume.forEach((item) => pushUnique(relatedKeywords, item && item.keyword));

  const mainJoined = mainKeywords.length ? mainKeywords.join(', ') : '—';
  const relatedJoined = relatedKeywords.length ? relatedKeywords.join(', ') : '—';

  return {
    title: 'Keyword Summary',
    rows: [
      ['頁面主要關鍵字', mainJoined],
      ['相關關鍵字', relatedJoined],
    ],
  };
}

function buildCoverageTableData_(analyzeData) {
  if (!analyzeData || !analyzeData.success || !analyzeData.keywordCoverage) return null;
  const rows = (analyzeData.keywordCoverage.covered || []).map((row) => [
    row.text,
    formatNumberDisplay_(row.searchVolume),
    formatNumberDisplay_(row.gsc && row.gsc.clicks),
    formatNumberDisplay_(row.gsc && row.gsc.impressions),
    formatNumberDisplay_(row.gsc && row.gsc.avgPosition, 1),
    '',
  ]).filter((row) => row.some((cell) => cell && cell !== '—'));
  if (!rows.length) return null;
  return {
    title: 'Keyword Data Notes',
    headers: ['Keyword', 'Search Volume', 'Clicks', 'Impressions', 'Avg Position', 'Keyword Data Note'],
    rows,
  };
}

function buildAdjustmentsTableData_(contextResult) {
  const suggestions = Array.isArray(contextResult?.suggestions) ? contextResult.suggestions : [];
  if (!suggestions.length) return null;
  const rows = suggestions.map((item) => {
    const before = sanitizeString_(item && item.before);
    const why = sanitizeString_(item && item.whyProblemNow);
    const after = sanitizeMultiline_((item && (item.afterAdjust || item.adjustAsFollows)) || '');
    if (!before || (!why && !after)) return null;
    const suggestion = [why, after].filter(Boolean).join('\n\n');
    return [before, suggestion];
  }).filter(Boolean);
  if (!rows.length) return null;
  return {
    title: 'Content Adjustments',
    headers: ['原文片段', '修改建議'],
    rows,
  };
}

function buildAdjustmentsPreviewText_(table) {
  if (!table) return '目前無調整建議';
  return table.rows.map(([before, suggestion], idx) => `${idx + 1}. 原文片段：${before}\n   修改建議：${suggestion}`).join('\n\n');
}

function parseOutlineEntries_(outline) {
  const text = sanitizeMultiline_(outline);
  if (!text) return [];
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '## Checklist — 我會做的事')
    .map((line) => {
      const h2 = line.match(/^h2\s+(.*)$/i);
      if (h2) return { level: 2, text: h2[1] };
      const h3 = line.match(/^h3\s+(.*)$/i);
      if (h3) return { level: 3, text: h3[1] };
      return { level: 2, text: line };
    });
}

function buildDocPreviewText_(sections) {
  const lines = ['SEO 優化報告'];
  lines.push(`頁面：${sections.heroPage}`);
  if (sections.heroKeyword) {
    lines.push(`核心關鍵字：${sections.heroKeyword}`);
  }
  if (sections.keywordSummaryTable) {
    lines.push('', sections.keywordSummaryTable.title);
    sections.keywordSummaryTable.rows.forEach((row) => {
      lines.push(`${row[0]}：${row[1]}`);
    });
  }
  if (sections.adjustmentsTable) {
    lines.push('', sections.adjustmentsTable.title);
    sections.adjustmentsTable.rows.forEach(([before, suggestion], idx) => {
      lines.push(`${idx + 1}. 原文片段：${before}`);
      lines.push(`   修改建議：${suggestion.replace(/\n/g, ' ')}`);
    });
  }
  if (sections.outlineEntries.length) {
    lines.push('', 'Suggested Outline');
    sections.outlineEntries.forEach((entry) => {
      if (entry.level === 2) {
        lines.push(`・${entry.text}`);
      } else {
        lines.push(`  - ${entry.text}`);
      }
    });
  }
  if (sections.coverageTable) {
    lines.push('', sections.coverageTable.title);
    lines.push(sections.coverageTable.headers.join(' | '));
    sections.coverageTable.rows.forEach((row) => lines.push(row.join(' | ')));
  }
  return lines.join('\n').trim();
}

function upsertDocumentWithSections_(docCell, docName, sections) {
  if (!docCell) return '';
  const existingLink = String(docCell.getValue() || '').trim();
  let docId = extractDocIdFromUrl_(existingLink);
  let doc = null;

  if (docId) {
    try {
      doc = DocumentApp.openById(docId);
    } catch (e) {
      doc = null;
      docId = '';
    }
  }

  if (!doc) {
    // 建立新文件
    doc = DocumentApp.create(docName || 'RepostLens Draft');

    // *** 新增的程式碼段落 START ***
    // 嘗試將新文件移動到指定資料夾
    try {
      const folderId = PropertiesService.getScriptProperties().getProperty('TARGET_FOLDER_ID');
      if (folderId) {
        const targetFolder = DriveApp.getFolderById(folderId);
        DriveApp.getFileById(doc.getId()).moveTo(targetFolder);
        dlog(`[upsertDocumentWithSections_] New doc ${doc.getId()} moved to folder ${folderId}`);
      }
    } catch (e) {
      dlog(`[upsertDocumentWithSections_] ERROR moving doc to folder: ${e.message}`);
      // 可選擇性地通知使用者，但不要中斷流程
      SpreadsheetApp.getUi().alert(`警告：無法將文件移動到指定資料夾。請檢查 TARGET_FOLDER_ID 是否正確。文件仍在您的雲端硬碟根目錄中建立。`);
    }
    // *** 新增的程式碼段落 END ***
  }

  const body = doc.getBody();
  body.clear();
  writeDocSectionsToBody_(body, sections);
  doc.saveAndClose();
  return doc.getUrl();
}

function deleteDocumentFromCell_(docCell) {
  if (!docCell) return;
  const existingLink = String(docCell.getValue() || '').trim();
  if (!existingLink) {
    docCell.clearContent();
    return;
  }
  const docId = extractDocIdFromUrl_(existingLink);
  if (docId) {
    try {
      const file = DriveApp.getFileById(docId);
      file.setTrashed(true);
      dlog(`[deleteDocumentFromCell_] trashed doc ${docId}`);
    } catch (e) {
      dlog(`[deleteDocumentFromCell_] failed to delete doc ${docId}: ${e.message}`);
    }
  }
  docCell.clearContent();
}


function writeDocSectionsToBody_(body, sections) {
  // Hero Section - 頁面與核心關鍵字
  const heroTitle = body.appendParagraph('SEO 優化報告');
  heroTitle.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  heroTitle.editAsText().setFontSize(24).setBold(true).setForegroundColor('#2C3E50');

  body.appendParagraph('');

  const pageLabel = body.appendParagraph('頁面');
  pageLabel.editAsText().setFontSize(11).setBold(true).setForegroundColor('#7F8C8D');

  const pageValue = body.appendParagraph(sections.heroPage);
  const pageText = pageValue.editAsText();
  pageText.setFontSize(14).setForegroundColor('#2980B9').setUnderline(true);
  pageText.setLinkUrl(sections.heroPageUrl);

  body.appendParagraph('');

  if (sections.heroKeyword) {
    const keywordLabel = body.appendParagraph('核心關鍵字');
    keywordLabel.editAsText().setFontSize(11).setBold(true).setForegroundColor('#7F8C8D');

    const keywordValue = body.appendParagraph(sections.heroKeyword);
    keywordValue.editAsText().setFontSize(16).setBold(true).setForegroundColor('#E74C3C');
  }

  // 插入換頁符號
  body.appendPageBreak();

  if (sections.keywordSummaryTable) {
    body.appendParagraph(sections.keywordSummaryTable.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const summaryTable = body.appendTable(sections.keywordSummaryTable.rows);
    summaryTable.setBorderWidth(1).setBorderColor('#CCCCCC');

    // 設定欄位寬度：左欄窄（100pt），右欄寬（300pt）
    for (let r = 0; r < summaryTable.getNumRows(); r += 1) {
      const row = summaryTable.getRow(r);
      row.getCell(0).setWidth(100).setBackgroundColor('#F3F3F3')
        .editAsText().setBold(true).setFontSize(10);
      row.getCell(1).setWidth(300)
        .editAsText().setFontSize(10);
      row.getCell(0).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
      row.getCell(1).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
    }
    body.appendParagraph('');
  }

  if (sections.adjustmentsTable) {
    body.appendParagraph(sections.adjustmentsTable.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const tableData = [sections.adjustmentsTable.headers, ...sections.adjustmentsTable.rows];
    const table = body.appendTable(tableData);
    table.setBorderWidth(1).setBorderColor('#CCCCCC');

    // 美化標題列
    const headerRow = table.getRow(0);
    for (let c = 0; c < headerRow.getNumCells(); c += 1) {
      const cell = headerRow.getCell(c);
      cell.setBackgroundColor('#4A90E2')
        .editAsText().setBold(true).setFontSize(11).setForegroundColor('#FFFFFF');
      cell.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12);
      cell.setWidth(c === 0 ? 150 : 300);
    }

    // 美化內容列
    for (let r = 1; r < table.getNumRows(); r += 1) {
      const row = table.getRow(r);
      const bgColor = r % 2 === 1 ? '#FFFFFF' : '#F9F9F9';
      for (let c = 0; c < row.getNumCells(); c += 1) {
        const cell = row.getCell(c);
        cell.setBackgroundColor(bgColor)
          .editAsText().setText(sections.adjustmentsTable.rows[r - 1][c]).setFontSize(10);
        cell.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12);
        cell.setWidth(c === 0 ? 150 : 300);
      }
    }
    body.appendParagraph('');
  }

  if (sections.outlineEntries.length) {
    body.appendParagraph('Suggested Outline').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    sections.outlineEntries.forEach((entry) => {
      if (entry.level === 2) {
        // H2 使用 ・ 符號
        const para = body.appendParagraph(`・${entry.text}`);
        para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        para.editAsText().setFontSize(11).setBold(true);
      } else {
        // H3 使用 - 符號並縮排
        const para = body.appendParagraph(`- ${entry.text}`);
        para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        para.setIndentStart(20); // 縮排 20pt
        para.editAsText().setFontSize(10);
      }
    });
  }

  if (sections.coverageTable) {
    body.appendParagraph('');
    body.appendParagraph(sections.coverageTable.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const tableData = [sections.coverageTable.headers, ...sections.coverageTable.rows];
    const table = body.appendTable(tableData);
    table.setBorderWidth(1).setBorderColor('#CCCCCC');

    // 美化標題列
    const headerRow = table.getRow(0);
    for (let c = 0; c < headerRow.getNumCells(); c += 1) {
      const cell = headerRow.getCell(c);
      cell.setBackgroundColor('#4A90E2')
        .editAsText().setBold(true).setFontSize(10).setForegroundColor('#FFFFFF');
      cell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
    }

    // 美化內容列
    for (let r = 1; r < table.getNumRows(); r += 1) {
      const row = table.getRow(r);
      const bgColor = r % 2 === 1 ? '#FFFFFF' : '#F9F9F9';
      for (let c = 0; c < row.getNumCells(); c += 1) {
        const cell = row.getCell(c);
        cell.setBackgroundColor(bgColor)
          .editAsText().setText(sections.coverageTable.rows[r - 1][c]).setFontSize(9);
        cell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
      }
    }
  }
}
function decodeURIComponentSafe_(url) { try { return decodeURI(String(url || '')); } catch (e) { return String(url || ''); } }
function formatNumberDisplay_(value, decimals) { if (value === null || value === undefined || value === '') return '—'; const num = typeof value === 'number' ? value : toNumberOrNull_(value); if (num === null) return '—'; decimals = decimals == null ? 0 : decimals; return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function formatPercentDisplay_(value) { const num = toNumberOrNull_(value); return num === null ? '—' : `${num.toFixed(2)}%`; }

function upsertDocumentWithText_(docCell, docName, content) {
  if (!docCell) return '';
  const existingLink = String(docCell.getValue() || '').trim();
  let docId = extractDocIdFromUrl_(existingLink);
  let doc = null;

  if (docId) {
    try {
      doc = DocumentApp.openById(docId);
    } catch (e) {
      doc = null;
      docId = '';
    }
  }

  if (!doc) {
    // 建立新文件
    doc = DocumentApp.create(docName || 'RepostLens Draft');

    // *** 新增的程式碼段落 START ***
    // 嘗試將新文件移動到指定資料夾
    try {
      const folderId = PropertiesService.getScriptProperties().getProperty('TARGET_FOLDER_ID');
      if (folderId) {
        const targetFolder = DriveApp.getFolderById(folderId);
        DriveApp.getFileById(doc.getId()).moveTo(targetFolder);
        dlog(`[upsertDocumentWithText_] New doc ${doc.getId()} moved to folder ${folderId}`);
      }
    } catch (e) {
      dlog(`[upsertDocumentWithText_] ERROR moving doc to folder: ${e.message}`);
    }
    // *** 新增的程式碼段落 END ***
  }

  const body = doc.getBody();
  body.clear();
  body.setText(String(content || ''));
  doc.saveAndClose();
  return doc.getUrl();
}

function extractDocIdFromUrl_(url) { const match = String(url || '').match(/(?:\/d\/|id=)([A-Za-z0-9_-]{10,})/); return match ? match[1] : ''; }
function sanitizeString_(value) { return typeof value === 'string' ? value.trim() : ''; }
function sanitizeMultiline_(value) { return value ? String(value).trim().replace(/\s+$/g, '') : ''; }
function toNumberOrNull_(value) { if (value === null || value === undefined || value === '') return null; if (typeof value === 'number') return isFinite(value) ? value : null; const num = Number(String(value).replace(/[^\d.+-]/g, '')); return isFinite(num) ? num : null; }
function getReportBase_() { if (!REPORT_API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE'); return REPORT_API_BASE.replace(/\/$/, ''); }
function isLikelyUrl_(s) { if (!s) return false; const str = String(s).trim(); return /^https?:\/\//i.test(str) && !!parseHostnameFromUrl_(str); }
function parseHostnameFromUrl_(s) { const match = String(s || '').match(/^https?:\/\/([^\/?#]+)/i); return match ? match[1] : null; }
function normalizeUrl_(s) { let v = String(s || '').trim().replace(/[\s\u00A0]+$/g, '').replace(/[\,\uFF0C\u3001\;\uFF1B\u3002]+$/g, '').replace(/^["']+|["']+$/g, ''); if (!v) return ''; if (!/^https?:\/\//i.test(v) && v.includes('.') && !v.includes(' ')) v = 'https://' + v; try { v = decodeURI(v); } catch (e) { } try { return encodeURI(v); } catch (e) { return v; } }
function safeJson_(s) { try { return JSON.parse(s); } catch (e) { return null; } }
