// RepostLens automation script (namespaced) — processes Search Console rows and writes results to an output sheet.
const RepostLensAutomation = (() => {
  const TARGET_SHEET_NAME = ''; // 留空代表使用當前分頁
  const OUTPUT_SHEET_SUFFIX = ' (Automation Output)';
  const PROCESSED_SHEET_SUFFIX = ' (Processed)';
  const OUTPUT_HEADERS = [
    'URL',
    'Result',
    'Adjustments Preview',
    'Outline Summary',
    'Doc Link',
    'Analysis Markdown'
  ];
  const BATCH_SIZE = 3;
  const ENABLE_DOC_EXPORT = false;

  const PATH_CONTEXT_VECTOR = '/api/report/context-vector';
  const PATH_ANALYZE = '/api/optimize/analyze';
  const PATH_SEARCH_BY_URL = '/api/search/by-url';
  const PATH_OUTLINE = '/api/report/outline';

  const COL_URL = 1;

  const MAX_CELL_LENGTH = 50000;
  const SAFE_CELL_LENGTH = 49000;
  const COL_CONTEXT_VECTOR = 2;
  const COL_ANALYSIS = 3;
  const COL_DOC_BODY = 4;
  const COL_DOC_LINK = 5;

  const REPORT_API_BASE = (() => {
    try {
      return PropertiesService.getScriptProperties().getProperty('REPORT_API_BASE') || '';
    } catch (e) {
      return '';
    }
  })();

  const DEBUG = true;

  const dlog = (msg) => {
    if (!DEBUG) return;
    try {
      Logger.log(String(msg));
    } catch (e) {
      // ignore
    }
  };

  const trunc = (s, n = 200) => {
    const str = String(s || '');
    return str.length <= n ? str : `${str.slice(0, n)}...`;
  };

  const createMenu = () => {
    SpreadsheetApp.getUi()
      .createMenu('RepostLens')
      .addItem('處理所有列 (Batch 3)', 'RL_AUTO_runForSheet')
      .addItem('處理當前列 (Force)', 'RL_AUTO_runForActiveRow')
      .addToUi();
    dlog('[onOpen] REPORT_API_BASE=' + REPORT_API_BASE);
  };

  const getTargetSheet = () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!TARGET_SHEET_NAME) return ss.getActiveSheet();
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) {
      SpreadsheetApp.getUi().alert(`找不到分頁 "${TARGET_SHEET_NAME}"`);
      return null;
    }
    return sheet;
  };

  const runForSheet = () => {
    const sheet = getTargetSheet();
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      SpreadsheetApp.getUi().alert('當前分頁沒有資料列');
      return;
    }

    const outputSheet = ensureOutputSheet(sheet);
    const processedUrlSet = getProcessedUrlSet(outputSheet);
    const ctx = { outputSheet, processedUrlSet, force: false };

    let processedCount = 0;
    for (let row = 2; row <= lastRow && processedCount < BATCH_SIZE; row += 1) {
      const success = processRow(sheet, row, ctx);
      if (success) processedCount += 1;
    }

    const message = processedCount
      ? `完成 ${processedCount} 筆資料`
      : '沒有新的資料需要處理';
    SpreadsheetApp.getActive().toast(message, 'RepostLens Automation', 5);
  };

  const runForActiveRow = () => {
    const sheet = getTargetSheet();
    if (!sheet) return;

    const activeSheet = SpreadsheetApp.getActiveSheet();
    if (activeSheet.getName() !== sheet.getName()) {
      SpreadsheetApp.getUi().alert('請切換到欲處理的分頁再執行');
      return;
    }

    const activeCell = activeSheet.getActiveCell();
    const row = activeCell.getRow();
    if (row < 2) {
      SpreadsheetApp.getUi().alert('請選擇第 2 列以後的資料列');
      return;
    }

    const outputSheet = ensureOutputSheet(sheet);
    const processedUrlSet = getProcessedUrlSet(outputSheet);
    const ctx = { outputSheet, processedUrlSet, force: true };

    const success = processRow(sheet, row, ctx);
    const message = success ? '完成 1 筆資料' : '此列無法處理或無效 URL';
    SpreadsheetApp.getActive().toast(message, 'RepostLens Automation', 5);
  };

  const processRow = (sheet, rowIndex, ctx) => {
    const outputSheet = ctx.outputSheet;
    const processedUrlSet = ctx.processedUrlSet;
    const force = ctx.force === true;

    const urlCell = sheet.getRange(rowIndex, COL_URL);
    const rawUrl = String(urlCell.getValue() || '').trim();
    const normalizedUrl = normalizeUrl(rawUrl);
    const allowSourceUpdate = shouldAllowSourceMutations(sheet);

    if (!normalizedUrl || !isLikelyUrl(normalizedUrl)) {
      const contextCell = getCellIfAvailable(sheet, rowIndex, COL_CONTEXT_VECTOR);
      if (allowSourceUpdate && contextCell) setCellValueSafe(contextCell, 'SKIP: 非有效網址');
      return false;
    }

    if (!force && processedUrlSet.has(normalizedUrl)) {
      dlog(`[processRow] skip already processed ${normalizedUrl}`);
      return false;
    }

    if (allowSourceUpdate) urlCell.setValue(normalizedUrl);

    const contextCell = getCellIfAvailable(sheet, rowIndex, COL_CONTEXT_VECTOR);
    const analysisCell = getCellIfAvailable(sheet, rowIndex, COL_ANALYSIS);
    const docBodyCell = getCellIfAvailable(sheet, rowIndex, COL_DOC_BODY);
    const docLinkCell = getCellIfAvailable(sheet, rowIndex, COL_DOC_LINK);

    let analyzeData = parseStoredAnalyzeResult(getCellValue(analysisCell));
    let analysisText = analyzeData?.analysis ? sanitizeMultiline(analyzeData.analysis) : '';
    const rowData = getRowDataForRow(sheet, rowIndex);
    const sheetAnalyzeSource = buildAnalyzeInputFromSheet(rowData, normalizedUrl);
    const sheetDocRow = buildDocSearchRowFromSheet(rowData, normalizedUrl);
    const sheetArticleText = sanitizeMultiline(pickValue(rowData, ['article_text', 'article_content', 'article']));

    const existingDocPreview = sanitizeMultiline(getCellValue(docBodyCell));
    const existingContextPreview = sanitizeMultiline(getCellValue(contextCell));
    const existingDocLink = sanitizeMultiline(getCellValue(docLinkCell));

    if (!force && analysisText && existingDocPreview) {
      appendOutputRow(outputSheet, {
        url: normalizedUrl,
        recommendation: existingDocPreview,
        adjustments: existingContextPreview,
        outline: sanitizeMultiline(analyzeData?.sections?.structuralChanges || ''),
        docLink: existingDocLink,
        analysis: analysisText,
      });
      processedUrlSet.add(normalizedUrl);
      return true;
    }

    try {
      const host = parseHostnameFromUrl(normalizedUrl);
      if (!host) throw new Error('URL 缺少 host');
      const site = 'sc-domain:' + host.replace(/^www\./, '');

      const searchRow = callSearchByUrl(site, normalizedUrl);
      const analyzeInputRow = Object.assign({}, sheetAnalyzeSource, searchRow || {});
      analyzeInputRow.page = analyzeInputRow.page || normalizedUrl;
      if (searchRow) {
        if (allowSourceUpdate) {
          try { urlCell.setNote('Source: ' + PATH_SEARCH_BY_URL); } catch (e) { /* ignore */ }
        }
      } else if (allowSourceUpdate && contextCell) {
        contextCell.setNote('search.by-url 無資料，改用頁面內容分析');
      }

      if (!analysisText || force) {
        const freshAnalysis = callOptimizeAnalyze(analyzeInputRow, normalizedUrl);
        analysisText = sanitizeMultiline(freshAnalysis.analysis || '');
        analyzeData = prepareAnalyzeDataForStorage(freshAnalysis);
        if (allowSourceUpdate && analysisCell && analyzeData) {
          const serialized = JSON.stringify(analyzeData);
          const stored = setCellValueSafe(analysisCell, serialized, MAX_CELL_LENGTH, { truncate: false });
          if (!stored) {
            analysisCell.setValue('ANALYSIS_TOO_LARGE');
            try { analysisCell.setNote('analysis payload exceeded 50k chars; rerun to regenerate'); } catch (e) { /* ignore */ }
          } else {
            try { analysisCell.setNote('Source: ' + PATH_ANALYZE); } catch (e) { /* ignore */ }
          }
        }
      }

      if (!analysisText) {
        if (allowSourceUpdate && contextCell) setCellValueSafe(contextCell, 'SKIP: 無分析內容');
        appendOutputRow(outputSheet, {
          url: normalizedUrl,
          recommendation: 'ERROR: 無分析內容',
          adjustments: '',
          outline: '',
          docLink: existingDocLink,
          analysis: '',
        });
        return false;
      }

      const fallbackArticleText = sheetArticleText || (!searchRow ? fetchArticleText(normalizedUrl) : null);

      let contextResult;
      let contextNote = null;
      try {
        contextResult = callReportApi(normalizedUrl, analysisText, fallbackArticleText);
        dlog(`[processRow] context-vector success: ${contextResult.suggestions.length} suggestions`);
      } catch (error) {
        const message = error && error.message ? String(error.message) : String(error);
        contextResult = { suggestions: [], markdown: 'Context vector 未生成' };
        contextNote = `context-vector skipped: ${message}`.slice(0, 500);
        dlog(`[processRow] context-vector fallback: ${message}`);
      }
      if (allowSourceUpdate && contextNote && contextCell) {
        try { contextCell.setNote(contextNote); } catch (e) { /* ignore */ }
      }
      const outline = callOutlineApi(analysisText);
      const docSections = prepareDocSections({
        pageUrl: normalizedUrl,
        searchRow: searchRow || sheetDocRow,
        outline,
        analyzeData,
        contextResult,
      });

      const contextText = buildAdjustmentsPreviewText(docSections.adjustmentsTable);
      if (allowSourceUpdate && contextCell) setCellValueSafe(contextCell, contextText);

      const docPreview = buildDocPreviewText(docSections);
      if (allowSourceUpdate && docBodyCell) setCellValueSafe(docBodyCell, docPreview);

      const docName = `RepostLens Draft - ${searchRow?.best_query || sheetDocRow.best_query || host}`;
      let docUrl = existingDocLink;
      if (ENABLE_DOC_EXPORT && allowSourceUpdate && docLinkCell) {
        docUrl = upsertDocumentWithSections(docLinkCell, docName, docSections, true);
      }

      appendOutputRow(outputSheet, {
        url: normalizedUrl,
        recommendation: docPreview,
        adjustments: contextText,
        outline: formatOutlineSummary(docSections.outlineEntries),
        docLink: docUrl || existingDocLink,
        analysis: analysisText,
      });

      processedUrlSet.add(normalizedUrl);

      if (rowIndex < sheet.getLastRow()) Utilities.sleep(600);
      return true;
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      dlog(`[processRow] ERROR row=${rowIndex} ${message}`);
      if (allowSourceUpdate && docBodyCell) setCellValueSafe(docBodyCell, `ERROR: ${message}`);
      appendOutputRow(outputSheet, {
        url: normalizedUrl,
        recommendation: `ERROR: ${message}`,
        adjustments: '',
        outline: '',
        docLink: '',
        analysis: analysisText,
      });
      return false;
    }
  };

  const getCellIfAvailable = (sheet, row, column) => {
    if (column > sheet.getMaxColumns()) return null;
    return sheet.getRange(row, column);
  };

  const getCellValue = (cell) => (cell ? cell.getValue() : '');

  const ensureOutputSheet = (sourceSheet) => {
    const ss = sourceSheet.getParent();
    const name = `${sourceSheet.getName()}${OUTPUT_SHEET_SUFFIX}`;
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    ensureOutputHeaders(sheet);
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
    return sheet;
  };

  const ensureOutputHeaders = (sheet) => {
    if (sheet.getMaxColumns() < OUTPUT_HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), OUTPUT_HEADERS.length - sheet.getMaxColumns());
    }
    const range = sheet.getRange(1, 1, 1, OUTPUT_HEADERS.length);
    const current = range.getValues()[0];
    let identical = true;
    for (let i = 0; i < OUTPUT_HEADERS.length; i += 1) {
      if (String(current[i] || '') !== OUTPUT_HEADERS[i]) {
        identical = false;
        break;
      }
    }
    if (!identical) {
      range.setValues([OUTPUT_HEADERS]);
    }
  };

  const getProcessedUrlSet = (sheet) => {
    const set = new Set();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return set;
    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    rows.forEach(([url, result]) => {
      const trimmedUrl = String(url || '').trim();
      const resultText = String(result || '').trim();
      if (!trimmedUrl) return;
      if (/^ERROR:/i.test(resultText)) return;
      set.add(trimmedUrl);
    });
    return set;
  };

  const appendOutputRow = (sheet, data) => {
    const rowValues = [
      data.url || '',
      truncateForCell(data.recommendation, 9000),
      truncateForCell(data.adjustments, 6000),
      truncateForCell(data.outline, 6000),
      data.docLink || '',
      truncateForCell(data.analysis, 20000),
    ];
    sheet.appendRow(rowValues);
    SpreadsheetApp.flush();
  };

  const truncateForCell = (value, maxLen = 20000) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
  };

  const setCellValueSafe = (cell, value, maxLength = SAFE_CELL_LENGTH, options = {}) => {
    if (!cell) return false;
    const str = value === null || value === undefined ? '' : String(value);
    const opts = Object.assign({ truncate: true, note: null }, options);
    if (!str) {
      cell.clearContent();
      if (opts.note) { try { cell.setNote(opts.note); } catch (e) { /* ignore */ } }
      return true;
    }
    if (str.length <= maxLength) {
      cell.setValue(str);
      if (opts.note) { try { cell.setNote(opts.note); } catch (e) { /* ignore */ } }
      return true;
    }
    if (!opts.truncate) return false;
    const truncated = str.slice(0, maxLength - 1) + '…';
    cell.setValue(truncated);
    if (opts.note) { try { cell.setNote(opts.note); } catch (e) { /* ignore */ } }
    return true;
  };

  const formatOutlineSummary = (outlineEntries) => {
    if (!Array.isArray(outlineEntries) || !outlineEntries.length) return '';
    const sections = [];
    let current = null;
    outlineEntries.forEach((entry) => {
      const level = Number(entry?.level) || 0;
      const text = sanitizeString(entry?.text);
      if (!text) return;
      if (level <= 2) {
        if (current) sections.push(current);
        current = { title: text, items: [] };
      } else {
        if (!current) current = { title: '其他重點', items: [] };
        current.items.push(text);
      }
    });
    if (current) sections.push(current);
    return sections
      .map((section) => {
        const titleLine = `• ${section.title}`;
        if (!section.items.length) return titleLine;
        const children = section.items.map((item) => `   - ${item}`).join('\n');
        return `${titleLine}\n${children}`;
      })
      .join('\n');
  };

  const parseStoredAnalyzeResult = (value) => {
    if (!value) return null;
    try {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        return JSON.parse(trimmed);
      }
      return typeof value === 'object' ? value : null;
    } catch (e) {
      return null;
    }
  };

  const callSearchByUrl = (site, pageUrl) => {
    const endpoint = getReportBase() + PATH_SEARCH_BY_URL;
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ site, page: String(pageUrl || '').replace(/\s+/g, '') }),
      muteHttpExceptions: true,
    });
    dlog(`[callSearchByUrl] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
      throw new Error(`search.by-url 錯誤: HTTP ${res.getResponseCode()}`);
    }
    const data = safeJson(res.getContentText());
    return Array.isArray(data) && data.length ? data[0] : null;
  };

  const callOptimizeAnalyze = (row, pageUrl) => {
    const source = row || {};
    const endpoint = getReportBase() + PATH_ANALYZE;
    const payload = {
      page: pageUrl || source.page,
      bestQuery: source.best_query,
      bestQueryClicks: toNumberOrNull(source.best_query_clicks),
      bestQueryPosition: toNumberOrNull(source.best_query_position),
      prevBestQuery: source.prev_best_query,
      prevBestPosition: toNumberOrNull(source.prev_best_position),
      prevBestClicks: toNumberOrNull(source.prev_best_clicks),
      rank1: source.rank_1,
      rank2: source.rank_2,
      rank3: source.rank_3,
      rank4: source.rank_4,
      rank5: source.rank_5,
      rank6: source.rank_6,
      rank7: source.rank_7,
      rank8: source.rank_8,
      rank9: source.rank_9,
      rank10: source.rank_10,
    };
    if (!payload.page) throw new Error('optimize.analyze 缺少 page');
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    dlog(`[callOptimizeAnalyze] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
      throw new Error(`optimize.analyze 錯誤: HTTP ${res.getResponseCode()}`);
    }
    const json = safeJson(res.getContentText());
    if (!json || json.success !== true) throw new Error('optimize.analyze 失敗');
    return json;
  };

  const callReportApi = (pageUrl, analysisText, articleText) => {
    const endpoint = getReportBase() + PATH_CONTEXT_VECTOR;
    const payload = {
      pageUrl: String(pageUrl || '').replace(/\s+/g, ''),
      analysisText,
    };
    // Always try to provide article text, either from sheet or by fetching
    const finalArticleText = articleText || fetchArticleText(pageUrl);
    if (finalArticleText) {
      payload.articleText = String(finalArticleText).slice(0, 8000);
      dlog(`[callReportApi] providing article text: ${finalArticleText.length} chars`);
    } else {
      dlog(`[callReportApi] no article text available for ${pageUrl}`);
    }
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    dlog(`[callReportApi] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
      throw new Error(`context-vector 錯誤: HTTP ${res.getResponseCode()}`);
    }
    const json = safeJson(res.getContentText());
    dlog(`[callReportApi] parsed JSON: ${JSON.stringify(json).slice(0, 200)}...`);
    if (!json || json.success !== true) throw new Error('context-vector 失敗');
    const result = {
      suggestions: Array.isArray(json.suggestions) ? json.suggestions : [],
      markdown: sanitizeMultiline(json.markdown || ''),
    };
    dlog(`[callReportApi] returning ${result.suggestions.length} suggestions`);
    return result;
  };

  const callOutlineApi = (analysisText) => {
    const endpoint = getReportBase() + PATH_OUTLINE;
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ analyzeResult: String(analysisText || '') }),
      muteHttpExceptions: true,
    });
    dlog(`[callOutlineApi] rc=${res.getResponseCode()} body=${trunc(res.getContentText(), 160)}`);
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
      throw new Error(`report.outline 錯誤: HTTP ${res.getResponseCode()}`);
    }
    return sanitizeMultiline(res.getContentText());
  };

  const prepareAnalyzeDataForStorage = (json) => {
    if (!json || typeof json !== 'object') return null;
    return {
      success: json.success,
      analysis: sanitizeMultiline(json.analysis || ''),
      sections: json.sections || null,
      keywordsAnalyzed: json.keywordsAnalyzed || null,
      topRankKeywords: json.topRankKeywords || null,
      rankKeywords: json.rankKeywords || null,
      previousRankKeywords: json.previousRankKeywords || null,
      zeroSearchVolumeKeywords: json.zeroSearchVolumeKeywords || null,
      contentExplorer: json.contentExplorer || null,
      keywordCoverage: json.keywordCoverage || null,
      promptBlocks: json.promptBlocks || null,
    };
  };

  const prepareDocSections = ({ pageUrl, searchRow, outline, analyzeData, contextResult }) => {
    const overviewItems = [];
    if (pageUrl) overviewItems.push(`URL：${decodeURIComponentSafe(pageUrl)}`);
    if (searchRow) {
      if (searchRow.best_query) overviewItems.push(`Best Query：${searchRow.best_query}`);
      if (searchRow.total_clicks !== undefined) {
        overviewItems.push(`總點擊：${formatNumberDisplay(searchRow.total_clicks)}`);
        overviewItems.push(`總曝光：${formatNumberDisplay(searchRow.total_impressions)}`);
        overviewItems.push(`總 CTR：${formatPercentDisplay(searchRow.total_ctr)}`);
        if (searchRow.best_query_position !== undefined) {
          overviewItems.push(`最佳關鍵字狀態：點擊 ${formatNumberDisplay(searchRow.best_query_clicks)}｜排名 ${formatNumberDisplay(searchRow.best_query_position, 1)}`);
        }
      }
    }

    const coverageTable = buildCoverageTableData(analyzeData);
    const adjustmentsTable = buildAdjustmentsTableData(contextResult);
    const outlineEntries = parseOutlineEntries(outline);

    return {
      overviewItems,
      coverageTable,
      adjustmentsTable,
      outlineEntries,
    };
  };

  const buildCoverageTableData = (analyzeData) => {
    if (!analyzeData || !analyzeData.success || !analyzeData.keywordCoverage) return null;
    const rows = (analyzeData.keywordCoverage.covered || [])
      .map((row) => [
        row.text,
        formatNumberDisplay(row.searchVolume),
        formatNumberDisplay(row.gsc && row.gsc.clicks),
        formatNumberDisplay(row.gsc && row.gsc.impressions),
        formatNumberDisplay(row.gsc && row.gsc.avgPosition, 1),
      ])
      .filter((row) => row.some((cell) => cell && cell !== '—'));
    if (!rows.length) return null;
    return {
      title: 'Keyword Coverage — 已覆蓋部分',
      headers: ['Keyword', 'Search Volume', 'Clicks', 'Impressions', 'Avg Position'],
      rows,
    };
  };

  const buildAdjustmentsTableData = (contextResult) => {
    const suggestions = Array.isArray(contextResult?.suggestions) ? contextResult.suggestions : [];
    dlog(`[buildAdjustmentsTableData] ${suggestions.length} suggestions received`);
    if (!suggestions.length) return null;
    const rows = suggestions
      .map((item) => {
        const before = sanitizeString(item && item.before);
        const why = sanitizeString(item && item.whyProblemNow);
        const after = sanitizeMultiline((item && (item.afterAdjust || item.adjustAsFollows)) || '');
        dlog(`[buildAdjustmentsTableData] processing: before="${before}", why="${why}", after="${after}"`);
        if (!before || (!why && !after)) return null;
        const suggestion = [why, after].filter(Boolean).join('\n\n');
        return [before, suggestion];
      })
      .filter(Boolean);
    dlog(`[buildAdjustmentsTableData] ${rows.length} valid rows created`);
    if (!rows.length) return null;
    return {
      title: 'Content Adjustments',
      headers: ['原文片段', '修改建議'],
      rows,
    };
  };

  const buildAdjustmentsPreviewText = (table) => {
    if (!table) return '目前無調整建議';
    return table.rows
      .map(([before, suggestion], idx) => `${idx + 1}. 原文片段：${before}\n   修改建議：${suggestion}`)
      .join('\n\n');
  };

  const parseOutlineEntries = (outline) => {
    if (!outline) return [];
    let raw = outline;
    if (typeof raw === 'string') raw = raw.trim();

    try {
      const parsed = JSON.parse(String(raw));
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.outline === 'string') {
          raw = parsed.outline;
        } else if (Array.isArray(parsed.sections)) {
          return parsed.sections
            .map((section) => ({
              level: 2,
              text: sanitizeString(section?.title || section?.heading || ''),
              items: Array.isArray(section?.items) ? section.items : [],
            }))
            .flatMap((section) => {
              const rows = [];
              if (section.text) rows.push({ level: 2, text: section.text });
              section.items.forEach((item) => {
                const child = typeof item === 'string' ? item : item?.text || item?.title || '';
                const cleaned = sanitizeString(child);
                if (cleaned) rows.push({ level: 3, text: cleaned });
              });
              return rows;
            });
        }
      }
    } catch {
      // not JSON, continue with raw string
    }

    const textValue = sanitizeMultiline(raw);
    if (!textValue) return [];
    return textValue
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== '## Checklist — 我會做的事')
      .map((line) => {
        const h2 = line.match(/^h2\s+(.*)$/i);
        if (h2) return { level: 2, text: h2[1] };
        const h3 = line.match(/^h3\s+(.*)$/i);
        if (h3) return { level: 3, text: h3[1] };
        return { level: 2, text: line };
      });
  };

  const buildDocPreviewText = (sections) => {
    const lines = ['Page Overview'];
    sections.overviewItems.forEach((item) => lines.push(`- ${item}`));
    if (sections.coverageTable) {
      lines.push('', sections.coverageTable.title);
      lines.push(sections.coverageTable.headers.join(' | '));
      sections.coverageTable.rows.forEach((row) => lines.push(row.join(' | ')));
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
        lines.push(`H${entry.level} ${entry.text}`);
      });
    }
    return lines.join('\n').trim();
  };

  const upsertDocumentWithSections = (docCell, docName, sections, allowWrite = true) => {
    const existingLink = docCell ? String(docCell.getValue() || '').trim() : '';
    let docId = extractDocIdFromUrl(existingLink);
    let doc = null;
    if (docId) {
      try { doc = DocumentApp.openById(docId); } catch (e) { doc = null; docId = ''; }
    }
    if (!doc) {
      doc = DocumentApp.create(docName || 'RepostLens Draft');
    }
    const body = doc.getBody();
    body.clear();
    writeDocSectionsToBody(body, sections);
    doc.saveAndClose();
    const url = doc.getUrl();
    if (allowWrite && docCell) {
      try { docCell.setValue(url); docCell.setNote('Google Docs 同步：' + url); } catch (e) { /* ignore */ }
    }
    return url;
  };

  const writeDocSectionsToBody = (body, sections) => {
    body.appendParagraph('Page Overview').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    sections.overviewItems.forEach((item) => {
      body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
    body.appendParagraph('');

    if (sections.coverageTable) {
      body.appendParagraph(sections.coverageTable.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      const tableData = [sections.coverageTable.headers, ...sections.coverageTable.rows];
      const table = body.appendTable(tableData);
      const headerRow = table.getRow(0);
      for (let c = 0; c < headerRow.getNumCells(); c += 1) {
        headerRow.getCell(c).editAsText().setBold(true);
      }
      for (let r = 1; r < table.getNumRows(); r += 1) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c += 1) {
          row.getCell(c).editAsText().setText(sections.coverageTable.rows[r - 1][c]);
        }
      }
      table.setBorderWidth(1);
      body.appendParagraph('');
    }

    if (sections.adjustmentsTable) {
      body.appendParagraph(sections.adjustmentsTable.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      const tableData = [sections.adjustmentsTable.headers, ...sections.adjustmentsTable.rows];
      const table = body.appendTable(tableData);
      const headerRow = table.getRow(0);
      for (let c = 0; c < headerRow.getNumCells(); c += 1) {
        headerRow.getCell(c).editAsText().setBold(true);
      }
      for (let r = 1; r < table.getNumRows(); r += 1) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c += 1) {
          row.getCell(c).editAsText().setText(sections.adjustmentsTable.rows[r - 1][c]);
        }
      }
      table.setBorderWidth(1);
      body.appendParagraph('');
    }

    if (sections.outlineEntries.length) {
      body.appendParagraph('Suggested Outline').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      sections.outlineEntries.forEach((entry) => {
        body.appendParagraph(`H${entry.level} ${entry.text}`)
          .setHeading(DocumentApp.ParagraphHeading.NORMAL);
      });
    }
  };

  const decodeURIComponentSafe = (url) => {
    try {
      return decodeURI(String(url || ''));
    } catch (e) {
      return String(url || '');
    }
  };

  const formatNumberDisplay = (value, decimals = 0) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : toNumberOrNull(value);
    if (num === null) return '—';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercentDisplay = (value) => {
    const num = toNumberOrNull(value);
    return num === null ? '—' : `${num.toFixed(2)}%`;
  };

  const extractDocIdFromUrl = (url) => {
    const match = String(url || '').match(/(?:\/d\/|id=)([A-Za-z0-9_-]{10,})/);
    return match ? match[1] : '';
  };

  const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

  const sanitizeMultiline = (value) => (value ? String(value).trim().replace(/\s+$/g, '') : '');

  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    const num = Number(String(value).replace(/[^\d.+-]/g, ''));
    return isFinite(num) ? num : null;
  };

  const getReportBase = () => {
    if (!REPORT_API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE');
    return REPORT_API_BASE.replace(/\/$/, '');
  };

  const isLikelyUrl = (s) => {
    if (!s) return false;
    const str = String(s).trim();
    return /^https?:\/\//i.test(str) && !!parseHostnameFromUrl(str);
  };

  const parseHostnameFromUrl = (s) => {
    const match = String(s || '').match(/^https?:\/\/([^\/?#]+)/i);
    return match ? match[1] : null;
  };

  const normalizeUrl = (s) => {
    let v = String(s || '')
      .trim()
      .replace(/[\s\u00A0]+$/g, '')
      .replace(/[\,\uFF0C\u3001\;\uFF1B\u3002]+$/g, '')
      .replace(/^["']+|["']+$/g, '');
    if (!v) return '';
    if (!/^https?:\/\//i.test(v) && v.includes('.') && !v.includes(' ')) v = 'https://' + v;
    try { v = decodeURI(v); } catch (e) { /* ignore */ }
    try { return encodeURI(v); } catch (e) { return v; }
  };

  const safeJson = (s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  };

  const isNonEmpty = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  };

  const normalizeHeaderKey = (name) => {
    const normalized = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized;
  };

  const sheetHeaderCache = new Map();

  const getSheetHeaders = (sheet) => {
    const cacheKey = sheet.getSheetId();
    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) return [];
    const cached = sheetHeaderCache.get(cacheKey);
    if (cached && cached.count === lastColumn) return cached.headers;
    const headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
    const headers = headerValues.map((name, idx) => ({
      key: normalizeHeaderKey(name),
      original: name,
      index: idx,
    }));
    sheetHeaderCache.set(cacheKey, { headers, count: lastColumn });
    return headers;
  };

  const getRowDataForRow = (sheet, rowIndex) => {
    const headers = getSheetHeaders(sheet);
    if (!headers.length) return {};
    const values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0] || [];
    const data = {};
    headers.forEach((header) => {
      if (!header.key) return;
      data[header.key] = values[header.index];
    });
    return data;
  };

  const pickValue = (rowData, keys) => {
    for (const key of keys) {
      if (!key) continue;
      const value = rowData?.[key];
      if (isNonEmpty(value)) return value;
    }
    return null;
  };

  const buildAnalyzeInputFromSheet = (rowData, pageUrl) => {
    const source = { page: pageUrl };
    const setString = (target, keys) => {
      const value = pickValue(rowData, keys);
      if (isNonEmpty(value)) source[target] = String(value);
    };
    const setNumber = (target, keys) => {
      const value = pickValue(rowData, keys);
      const number = toNumberOrNull(value);
      if (number !== null && number !== undefined) source[target] = number;
    };

    setString('best_query', ['best_query', 'current_best_query', 'main_keyword']);
    setNumber('best_query_clicks', ['best_query_clicks', 'current_best_query_clicks']);
    setNumber('best_query_position', ['best_query_position', 'current_best_query_position']);
    setNumber('best_query_volume', ['best_query_volume']);

    setString('prev_best_query', ['prev_best_query']);
    setNumber('prev_best_clicks', ['prev_best_clicks']);
    setNumber('prev_best_position', ['prev_best_position']);
    setString('prev_main_keyword', ['prev_main_keyword']);
    setNumber('prev_keyword_rank', ['prev_keyword_rank']);
    setNumber('prev_keyword_traffic', ['prev_keyword_traffic']);

    for (let i = 1; i <= 10; i += 1) {
      const key = `rank_${i}`;
      const value = pickValue(rowData, [key, `current_rank_${i}`]);
      if (isNonEmpty(value)) source[key] = String(value);
    }
    const gt10 = pickValue(rowData, ['rank_gt10', 'current_rank_gt10']);
    if (isNonEmpty(gt10)) source.rank_gt10 = String(gt10);

    return source;
  };

  const buildDocSearchRowFromSheet = (rowData, pageUrl) => {
    const base = buildAnalyzeInputFromSheet(rowData, pageUrl);
    const setNumber = (target, keys) => {
      const value = pickValue(rowData, keys);
      const number = toNumberOrNull(value);
      if (number !== null && number !== undefined) base[target] = number;
    };
    setNumber('total_clicks', ['total_clicks']);
    setNumber('total_impressions', ['total_impressions']);
    setNumber('total_ctr', ['total_ctr']);
    setNumber('keywords_1to10_count', ['keywords_1to10_count']);
    setNumber('keywords_4to10_count', ['keywords_4to10_count']);
    setNumber('total_keywords', ['total_keywords']);
    return base;
  };

  const htmlToPlainText = (html, maxLength) => {
    if (!html) return '';
    const cleaned = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return maxLength ? cleaned.slice(0, maxLength) : cleaned;
  };

  const fetchArticleText = (url) => {
    if (!isLikelyUrl(url)) return null;
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RepostLensBot/1.0)',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
      });
      const code = res.getResponseCode();
      if (code < 200 || code >= 300) {
        dlog(`[fetchArticleText] HTTP ${code} for ${url}`);
        return null;
      }
      const text = htmlToPlainText(res.getContentText(), 8000);
      return sanitizeMultiline(text);
    } catch (err) {
      dlog(`[fetchArticleText] ${url} -> ${err}`);
      return null;
    }
  };

  const shouldAllowSourceMutations = (sheet) => {
    if (!sheet || typeof sheet.getName !== 'function') return true;
    const name = String(sheet.getName() || '');
    if (!name) return true;
    if (name.endsWith(OUTPUT_SHEET_SUFFIX)) return false;
    if (name.endsWith(PROCESSED_SHEET_SUFFIX)) return false;
    return true;
  };

  return {
    createMenu,
    runForSheet,
    runForActiveRow,
  };
})();

function RL_AUTO_onOpenMenu() {
  RepostLensAutomation.createMenu();
}

function RL_AUTO_runForSheet() {
  RepostLensAutomation.runForSheet();
}

function RL_AUTO_runForActiveRow() {
  RepostLensAutomation.runForActiveRow();
}
