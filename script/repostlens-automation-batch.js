// RepostLens automation script (batch API version)
const RepostLensAutomationBatch = (() => {
  const OUTPUT_SHEET_SUFFIX = ' (Automation Output)';
  const OUTPUT_HEADERS = [
    'URL',
    'Result',
    'Adjustments Preview',
    'Outline Summary',
    'Doc Link',
    'Analysis Markdown'
  ];
  const BATCH_SIZE = 10;
  const ENABLE_DOC_EXPORT = false;

  const API_BASE = (() => {
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

  const createMenu = () => {
    SpreadsheetApp.getUi()
      .createMenu('RepostLens Batch')
      .addItem('處理所有列 (Batch 10)', 'RL_BATCH_runForSheet')
      .addItem('處理當前列 (Force)', 'RL_BATCH_runForActiveRow')
      .addSeparator()
      .addItem('設定自動觸發器 (每3分鐘)', 'RL_BATCH_createTrigger')
      .addItem('刪除自動觸發器', 'RL_BATCH_deleteTrigger')
      .addToUi();
    dlog('[onOpen] REPORT_API_BASE=' + API_BASE);
  };

  const getTargetSheet = () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 嘗試從 PropertiesService 獲取儲存的 sheet 名稱（用於觸發器）
    try {
      const savedSheetName = PropertiesService.getScriptProperties().getProperty('RL_BATCH_TARGET_SHEET');
      if (savedSheetName) {
        const sheet = ss.getSheetByName(savedSheetName);
        if (sheet) {
          dlog(`[getTargetSheet] using saved sheet: ${savedSheetName}`);
          return sheet;
        }
      }
    } catch (e) {
      dlog(`[getTargetSheet] failed to get saved sheet: ${e.message}`);
    }

    // 最後回退到活動 sheet（如果有的話）
    try {
      return ss.getActiveSheet();
    } catch (e) {
      // 如果沒有活動 sheet（觸發器執行時），使用第一個 sheet
      dlog(`[getTargetSheet] no active sheet, using first sheet: ${e.message}`);
      const sheets = ss.getSheets();
      return sheets.length > 0 ? sheets[0] : null;
    }
  };

  const createTrigger = () => {
    // 獲取當前活動的 sheet 名稱並儲存
    const currentSheet = SpreadsheetApp.getActiveSheet();
    const sheetName = currentSheet.getName();

    try {
      PropertiesService.getScriptProperties().setProperty('RL_BATCH_TARGET_SHEET', sheetName);
      dlog(`[createTrigger] saved target sheet: ${sheetName}`);
    } catch (e) {
      SpreadsheetApp.getUi().alert('無法儲存目標 sheet 設定: ' + e.message);
      return;
    }

    // 刪除現有的觸發器
    const triggers = ScriptApp.getProjectTriggers();
    let deletedCount = 0;
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'RL_BATCH_runForSheet') {
        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
      }
    });

    // 創建新的定時觸發器，每3分鐘執行一次
    ScriptApp.newTrigger('RL_BATCH_runForSheet')
      .timeBased()
      .everyMinutes(3)
      .create();

    SpreadsheetApp.getActive().toast(`已設定每3分鐘自動處理觸發器\n目標分頁: ${sheetName}\n刪除舊觸發器: ${deletedCount}個`, 'RepostLens Batch', 8);
  };

  const deleteTrigger = () => {
    const triggers = ScriptApp.getProjectTriggers();
    let deleted = 0;
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'RL_BATCH_runForSheet') {
        ScriptApp.deleteTrigger(trigger);
        deleted++;
      }
    });

    // 清除儲存的 sheet 名稱
    try {
      PropertiesService.getScriptProperties().deleteProperty('RL_BATCH_TARGET_SHEET');
    } catch (e) {
      dlog(`[deleteTrigger] failed to clear saved sheet: ${e.message}`);
    }

    SpreadsheetApp.getActive().toast(`已刪除 ${deleted} 個自動觸發器`, 'RepostLens Batch', 5);
  };

  const runForSheet = () => {
    const sheet = getTargetSheet();
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      dlog('[runForSheet] 當前分頁沒有資料列');
      return;
    }

    dlog(`[runForSheet] 開始處理 sheet: ${sheet.getName()}, 總列數: ${lastRow}`);

    const outputSheet = ensureOutputSheet(sheet);
    const processedUrlSet = getProcessedUrlSet(outputSheet);

    dlog(`[runForSheet] 已處理 URL 數量: ${processedUrlSet.size}`);

    // 收集待處理的資料
    const pendingRows = [];
    for (let row = 2; row <= lastRow; row++) {
      const urlCell = sheet.getRange(row, 1);
      const rawUrl = String(urlCell.getValue() || '').trim();
      const normalizedUrl = normalizeUrl(rawUrl);

      if (!normalizedUrl || !isLikelyUrl(normalizedUrl)) {
        continue;
      }

      if (processedUrlSet.has(normalizedUrl)) {
        continue;
      }

      pendingRows.push({ url: normalizedUrl, row });
    }

    if (pendingRows.length === 0) {
      SpreadsheetApp.getActive().toast('沒有新的資料需要處理', 'RepostLens Batch', 5);
      return;
    }

    // 取一個 batch
    const batch = pendingRows.slice(0, BATCH_SIZE);
    dlog(`[runForSheet] 開始批次處理: ${batch.length} 筆`);

    let processedCount = 0;
    try {
      processedCount = processBatch(sheet, batch, outputSheet);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      dlog(`[runForSheet] 批次處理錯誤: ${message}`);
      SpreadsheetApp.getActive().toast(`批次處理錯誤: ${message}`, 'RepostLens Batch', 5);
      return;
    }

    const message = processedCount > 0
      ? `完成 ${processedCount} 筆資料 (剩餘 ${pendingRows.length - batch.length} 筆)`
      : '沒有成功處理的資料';
    
    dlog(`[runForSheet] ${message}`);
    SpreadsheetApp.getActive().toast(message, 'RepostLens Batch', 5);
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

    const urlCell = sheet.getRange(row, 1);
    const rawUrl = String(urlCell.getValue() || '').trim();
    const normalizedUrl = normalizeUrl(rawUrl);

    if (!normalizedUrl || !isLikelyUrl(normalizedUrl)) {
      SpreadsheetApp.getUi().alert('此列沒有有效的 URL');
      return;
    }

    const outputSheet = ensureOutputSheet(sheet);
    
    dlog(`[runForActiveRow] 強制處理第 ${row} 列: ${normalizedUrl}`);

    try {
      const success = processBatch(sheet, [{ url: normalizedUrl, row }], outputSheet);
      const message = success > 0 ? '完成 1 筆資料' : '此列無法處理';
      dlog(`[runForActiveRow] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Batch', 5);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      dlog(`[runForActiveRow] 處理錯誤: ${message}`);
      SpreadsheetApp.getActive().toast(`處理錯誤: ${message}`, 'RepostLens Batch', 5);
    }
  };

  const processBatch = (sheet, batch, outputSheet) => {
    const startTime = Date.now();
    dlog(`[processBatch] 開始批次處理 ${batch.length} 筆資料`);

    // 準備批次資料
    const batchData = batch.map(({ url, row }) => {
      const rowData = getRowDataForRow(sheet, row);
      const analyzeInput = buildAnalyzeInputFromSheet(rowData, url);
      return {
        url,
        row,
        ...analyzeInput
      };
    });

    dlog(`[processBatch] 調用批次 API，資料: ${JSON.stringify(batchData).slice(0, 300)}...`);

    // 調用批次 API
    const batchResults = callBatchAPI(batchData);

    dlog(`[processBatch] 批次 API 成功，結果數量: ${batchResults?.results?.length || 0}`);

    let processedCount = 0;

    // 處理結果並寫入 sheet
    if (batchResults?.results && Array.isArray(batchResults.results)) {
      batchResults.results.forEach((result, index) => {
        const { url, row } = batch[index];

        try {
          if (result.success) {
            // 處理成功的結果
            const contextResult = { suggestions: result.suggestions || [] };
            const outline = result.outline || '';
            
            const docSections = prepareDocSections({
              pageUrl: url,
              searchRow: null, // 批次 API 不包含 searchRow
              outline,
              analyzeData: { analysis: result.analysis },
              contextResult,
            });

            const contextText = buildAdjustmentsPreviewText(docSections.adjustmentsTable);
            const docPreview = buildDocPreviewText(docSections);

            let docUrl = '';
            if (ENABLE_DOC_EXPORT) {
              const docName = `RepostLens Draft - ${extractHostFromUrl(url)}`;
              docUrl = upsertDocumentWithSections(null, docName, docSections, false);
            }

            appendOutputRow(outputSheet, {
              url: url,
              recommendation: docPreview,
              adjustments: contextText,
              outline: formatOutlineSummary(docSections.outlineEntries),
              docLink: docUrl,
              analysis: result.analysis || '',
            });

            processedCount++;
            dlog(`[processBatch] 成功處理: ${url}`);
          } else {
            // 處理失敗的結果
            const errorMsg = `ERROR: ${result.error || '未知錯誤'}`;
            appendOutputRow(outputSheet, {
              url: url,
              recommendation: errorMsg,
              adjustments: '',
              outline: '',
              docLink: '',
              analysis: '',
            });
            dlog(`[processBatch] 處理失敗: ${url} - ${result.error}`);
          }
        } catch (e) {
          const errorMsg = `ERROR: 結果處理失敗 - ${e.message}`;
          appendOutputRow(outputSheet, {
            url: url,
            recommendation: errorMsg,
            adjustments: '',
            outline: '',
            docLink: '',
            analysis: '',
          });
          dlog(`[processBatch] 結果處理失敗: ${url} - ${e.message}`);
        }
      });
    } else {
      // API 回傳格式錯誤
      batch.forEach(({ url }) => {
        appendOutputRow(outputSheet, {
          url: url,
          recommendation: 'ERROR: 批次 API 回傳格式錯誤',
          adjustments: '',
          outline: '',
          docLink: '',
          analysis: '',
        });
      });
    }

    const duration = (Date.now() - startTime) / 1000;
    dlog(`[processBatch] 批次完成，耗時: ${duration}秒，成功: ${processedCount}/${batch.length}`);

    return processedCount;
  };

  const callBatchAPI = (batchData) => {
    const endpoint = getReportBase() + '/api/batch-process';
    const payload = { batch: batchData };

    dlog(`[callBatchAPI] 調用批次 API: ${endpoint}`);

    const res = UrlFetchApp.fetch(endpoint, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const responseCode = res.getResponseCode();
    dlog(`[callBatchAPI] 批次 API 回應: ${responseCode}`);

    if (responseCode < 200 || responseCode >= 300) {
      const errorText = res.getContentText();
      dlog(`[callBatchAPI] 批次 API 錯誤內容: ${errorText.slice(0, 200)}`);
      throw new Error(`批次 API 錯誤: HTTP ${responseCode}: ${errorText.slice(0, 100)}`);
    }

    const json = safeJson(res.getContentText());
    if (!json || json.success !== true) {
      throw new Error('批次 API 回傳失敗');
    }

    return json;
  };

  // === 以下是從原本 automation.js 複製的輔助函數 ===

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
    const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    rows.forEach(([url, result, adjustments, outline, docLink, analysis]) => {
      const trimmedUrl = String(url || '').trim();
      const resultText = String(result || '').trim();
      const adjustmentsText = String(adjustments || '').trim();
      const analysisText = String(analysis || '').trim();

      if (!trimmedUrl) return;

      // 如果是錯誤結果，不算已處理（允許重試）
      if (/^ERROR:/i.test(resultText)) return;

      // 只有當有實際內容時才算已處理
      if (resultText && (adjustmentsText || analysisText)) {
        set.add(trimmedUrl);
        dlog(`[getProcessedUrlSet] found processed URL: ${trimmedUrl}`);
      }
    });
    dlog(`[getProcessedUrlSet] total processed URLs: ${set.size}`);
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

  const parseOutlineEntries = (outline) => {
    const text = sanitizeMultiline(outline);
    if (!text) return [];
    return text
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

  // === 通用輔助函數 ===

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

  const extractHostFromUrl = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return 'unknown';
    }
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
    if (!API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE');
    return API_BASE.replace(/\/$/, '');
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

    setString('bestQuery', ['best_query', 'current_best_query', 'main_keyword']);
    setNumber('bestQueryClicks', ['best_query_clicks', 'current_best_query_clicks']);
    setNumber('bestQueryPosition', ['best_query_position', 'current_best_query_position']);
    setString('prevBestQuery', ['prev_best_query']);
    setNumber('prevBestClicks', ['prev_best_clicks']);
    setNumber('prevBestPosition', ['prev_best_position']);

    for (let i = 1; i <= 10; i += 1) {
      const key = `rank${i}`;
      const value = pickValue(rowData, [`rank_${i}`, `current_rank_${i}`]);
      if (isNonEmpty(value)) source[key] = String(value);
    }

    return source;
  };

  return {
    createMenu,
    runForSheet,
    runForActiveRow,
    createTrigger,
    deleteTrigger,
  };
})();

function RL_BATCH_onOpenMenu() {
  RepostLensAutomationBatch.createMenu();
}

function RL_BATCH_runForSheet() {
  RepostLensAutomationBatch.runForSheet();
}

function RL_BATCH_runForActiveRow() {
  RepostLensAutomationBatch.runForActiveRow();
}

function RL_BATCH_createTrigger() {
  RepostLensAutomationBatch.createTrigger();
}

function RL_BATCH_deleteTrigger() {
  RepostLensAutomationBatch.deleteTrigger();
}