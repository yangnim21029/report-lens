// RepostLens automation script (optimized for activeSheet processing)
const RepostLensAutomation = (() => {
  const OUTPUT_HEADERS = ['URL', 'Result', 'Adjustments Preview', 'Outline Summary', 'Doc Link', 'Analysis Markdown'];
  const BATCH_SIZE = 10;
  const API_BASE = PropertiesService.getScriptProperties().getProperty('REPORT_API_BASE') || '';

  const dlog = (msg) => {
    try {
      Logger.log(String(msg));
      console.log(String(msg));
    } catch (e) {
      // ignore
    }
  };

  const createMenu = () => {
    SpreadsheetApp.getUi().createMenu('RepostLens')
      .addItem('處理所有列 (Batch 10)', 'RL_AUTO_runForSheet')
      .addItem('處理當前列 (Force)', 'RL_AUTO_runForActiveRow')
      .addSeparator()
      .addItem('設定自動觸發器 (每3分鐘)', 'RL_AUTO_createTrigger')
      .addItem('刪除自動觸發器', 'RL_AUTO_deleteTrigger')
      .addToUi();
  };

  const getTargetSheet = () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 嘗試從 PropertiesService 獲取儲存的 sheet 名稱（用於觸發器）
    try {
      const savedSheetName = PropertiesService.getScriptProperties().getProperty('RL_AUTO_TARGET_SHEET');
      if (savedSheetName) {
        const sheet = ss.getSheetByName(savedSheetName);
        if (sheet) {
          dlog(`[getTargetSheet] 使用已儲存的 sheet: ${savedSheetName}`);
          return sheet;
        }
      }
    } catch (e) {
      dlog(`[getTargetSheet] 無法取得已儲存的 sheet: ${e.message}`);
    }

    // 嘗試使用當前活動的 sheet
    try {
      const activeSheet = ss.getActiveSheet();
      dlog(`[getTargetSheet] 使用活動 sheet: ${activeSheet.getName()}`);
      return activeSheet;
    } catch (e) {
      dlog(`[getTargetSheet] 無法取得活動 sheet，使用第一個 sheet: ${e.message}`);
      return ss.getSheets()[0];
    }
  };

  const createTrigger = () => {
    const sheet = SpreadsheetApp.getActiveSheet();
    PropertiesService.getScriptProperties().setProperty('RL_AUTO_TARGET_SHEET', sheet.getName());

    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'RL_AUTO_runForSheet') ScriptApp.deleteTrigger(t);
    });

    ScriptApp.newTrigger('RL_AUTO_runForSheet').timeBased().everyMinutes(3).create();
    SpreadsheetApp.getActive().toast(`已設定觸發器 (${sheet.getName()})`, 'RepostLens', 3);
  };

  const deleteTrigger = () => {
    let count = 0;
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'RL_AUTO_runForSheet') {
        ScriptApp.deleteTrigger(t);
        count++;
      }
    });
    PropertiesService.getScriptProperties().deleteProperty('RL_AUTO_TARGET_SHEET');
    SpreadsheetApp.getActive().toast(`已刪除 ${count} 個觸發器`, 'RepostLens', 3);
  };

  const runForSheet = () => {
    const sheet = getTargetSheet();
    if (!sheet || sheet.getLastRow() < 2) {
      dlog('[runForSheet] 沒有資料或 sheet 不存在');
      return;
    }

    dlog(`[runForSheet] 開始處理 sheet: ${sheet.getName()}, 總列數: ${sheet.getLastRow()}`);

    const output = getOutputSheet(sheet);
    const processed = new Set(output.getRange(2, 1, Math.max(1, output.getLastRow() - 1), 2)
      .getValues().filter(([url, result]) => url && result && !result.toString().startsWith('ERROR:'))
      .map(([url]) => url.toString().trim()));

    dlog(`[runForSheet] 已處理 URL 數量: ${processed.size}`);

    // 收集待處理的資料
    const pendingRows = [];
    for (let row = 2; row <= sheet.getLastRow(); row++) {
      const url = String(sheet.getRange(row, 1).getValue() || '').trim();
      if (!url || processed.has(url)) continue;
      pendingRows.push({ url, row });
    }

    if (pendingRows.length === 0) {
      SpreadsheetApp.getActive().toast('沒有新資料需要處理', 'RepostLens', 3);
      return;
    }

    // 取一個 batch (3筆)
    const batch = pendingRows.slice(0, BATCH_SIZE);
    dlog(`[runForSheet] 開始併發處理 batch: ${batch.length} 筆`);
    SpreadsheetApp.getActive().toast(`併發處理 ${batch.length} 筆資料...`, 'RepostLens', 2);

    // 併發處理
    const results = processBatchConcurrent(batch, sheet, output);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const message = `完成 batch: 成功 ${successCount} 筆, 失敗 ${failCount} 筆 (剩餘 ${pendingRows.length - batch.length} 筆)`;
    dlog(`[runForSheet] ${message}`);
    SpreadsheetApp.getActive().toast(message, 'RepostLens', 5);
  };

  const processBatchConcurrent = (batch, sheet, output) => {
    const startTime = Date.now();

    dlog(`[processBatchConcurrent] 開始批次處理 ${batch.length} 筆資料`);
    SpreadsheetApp.getActive().toast(`批次處理 ${batch.length} 筆資料...`, 'RepostLens', 2);

    try {
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

      dlog(`[processBatchConcurrent] 調用批次 API，資料: ${JSON.stringify(batchData).slice(0, 300)}...`);

      // 調用批次 API
      const batchResults = callAPI('/api/batch-process', {
        batch: batchData
      });

      dlog(`[processBatchConcurrent] 批次 API 成功，結果數量: ${batchResults?.results?.length || 0}`);

      // 處理結果並寫入 sheet
      const results = [];
      if (batchResults?.results && Array.isArray(batchResults.results)) {
        batchResults.results.forEach((result, index) => {
          const { url, row } = batch[index];

          try {
            if (result.success) {
              // 解析 outline
              const outlineEntries = parseOutlineEntries(result.outline || '');

              // 寫入成功結果
              output.appendRow([
                url,
                'SUCCESS',
                formatSuggestions(result.suggestions),
                formatOutlineSummary(outlineEntries),
                '',
                result.analysis || ''
              ]);

              results.push({ url, row, success: true, error: null });
              dlog(`[processBatchConcurrent] 成功處理: ${url}`);
            } else {
              // 寫入錯誤結果
              const errorMsg = `ERROR: ${result.error || '未知錯誤'}`;
              output.appendRow([url, errorMsg, '', '', '', '']);
              results.push({ url, row, success: false, error: result.error });
              dlog(`[processBatchConcurrent] 處理失敗: ${url} - ${result.error}`);
            }
          } catch (e) {
            const errorMsg = `ERROR: 結果處理失敗 - ${e.message}`;
            output.appendRow([url, errorMsg, '', '', '', '']);
            results.push({ url, row, success: false, error: e.message });
            dlog(`[processBatchConcurrent] 結果處理失敗: ${url} - ${e.message}`);
          }
        });
      } else {
        // API 回傳格式錯誤
        batch.forEach(({ url, row }) => {
          const errorMsg = 'ERROR: 批次 API 回傳格式錯誤';
          output.appendRow([url, errorMsg, '', '', '', '']);
          results.push({ url, row, success: false, error: '批次 API 回傳格式錯誤' });
        });
      }

      // 統一 flush
      SpreadsheetApp.flush();

      const duration = (Date.now() - startTime) / 1000;
      dlog(`[processBatchConcurrent] 批次完成，耗時: ${duration}秒`);

      return results;

    } catch (e) {
      dlog(`[processBatchConcurrent] 批次處理失敗: ${e.message}`);

      // 所有項目標記為失敗
      const results = batch.map(({ url, row }) => {
        const errorMsg = `ERROR: 批次處理失敗 - ${e.message}`;
        output.appendRow([url, errorMsg, '', '', '', '']);
        return { url, row, success: false, error: e.message };
      });

      SpreadsheetApp.flush();
      return results;
    }
  };

  const runForActiveRow = () => {
    const sheet = SpreadsheetApp.getActiveSheet();
    const row = sheet.getActiveCell().getRow();
    if (row < 2) {
      SpreadsheetApp.getUi().alert('請選擇第 2 列以後的資料列');
      return;
    }

    const url = String(sheet.getRange(row, 1).getValue() || '').trim();
    if (!url) {
      SpreadsheetApp.getUi().alert('此列沒有 URL');
      return;
    }

    dlog(`[runForActiveRow] 強制處理第 ${row} 列: ${url}`);
    SpreadsheetApp.getActive().toast(`處理中: 第${row}列`, 'RepostLens', 2);

    const success = processRow(url, sheet, row, getOutputSheet(sheet));
    const message = success ? `完成處理第 ${row} 列` : `處理失敗: 第 ${row} 列`;

    dlog(`[runForActiveRow] ${message}`);
    SpreadsheetApp.getActive().toast(message, 'RepostLens', 3);
  };

  const processRow = (url, sheet, row, output) => {
    try {
      dlog(`[processRow] 開始處理: ${url}`);

      // 從 sheet 讀取資料構建 API 請求
      const rowData = getRowDataForRow(sheet, row);
      const analyzeInput = buildAnalyzeInputFromSheet(rowData, url);
      dlog(`[processRow] 構建 analyze 輸入: ${JSON.stringify(analyzeInput).slice(0, 200)}...`);

      // 調用 analyze API
      dlog(`[processRow] 調用 analyze API...`);
      const analysis = callAPI('/api/optimize/analyze', analyzeInput);
      if (!analysis?.analysis) throw new Error('無分析結果');
      dlog(`[processRow] analyze API 成功，分析長度: ${analysis.analysis.length}`);

      // 調用 context-vector API
      dlog(`[processRow] 調用 context-vector API...`);
      const context = callAPI('/api/report/context-vector', {
        pageUrl: url,
        analysisText: analysis.analysis
      });
      dlog(`[processRow] context-vector API 成功，建議數量: ${context?.suggestions?.length || 0}`);

      // 調用 outline API
      dlog(`[processRow] 調用 outline API...`);
      const outlineResponse = callAPI('/api/report/outline', {
        analyzeResult: analysis.analysis
      });
      const outline = String(outlineResponse?.outline || '');
      dlog(`[processRow] outline API 成功，outline 長度: ${outline.length}`);

      // 輸出結果
      dlog(`[processRow] outline 原始資料: ${JSON.stringify(outline).slice(0, 300)}...`);
      const outlineEntries = parseOutlineEntries(outline);
      dlog(`[processRow] 解析後的 outlineEntries: ${JSON.stringify(outlineEntries).slice(0, 300)}...`);
      const formattedOutline = formatOutlineSummary(outlineEntries);
      dlog(`[processRow] 格式化後的 outline: ${formattedOutline.slice(0, 200)}...`);

      output.appendRow([
        url, 'SUCCESS',
        formatSuggestions(context?.suggestions),
        formattedOutline,
        '', analysis.analysis
      ]);
      dlog(`[processRow] 成功完成: ${url}`);
      return true;
    } catch (e) {
      const errorMsg = `ERROR: ${e.message}`;
      dlog(`[processRow] 處理失敗 ${url}: ${errorMsg}`);
      output.appendRow([url, errorMsg, '', '', '', '']);
      return false;
    }
  };

  const callAPI = (path, data) => {
    const url = API_BASE + path;
    dlog(`[callAPI] 調用: ${path}`);

    const res = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    });

    const responseCode = res.getResponseCode();
    dlog(`[callAPI] ${path} 回應: ${responseCode}`);

    if (responseCode !== 200) {
      const errorText = res.getContentText();
      dlog(`[callAPI] ${path} 錯誤內容: ${errorText.slice(0, 200)}`);
      throw new Error(`API ${responseCode}: ${errorText.slice(0, 100)}`);
    }

    return JSON.parse(res.getContentText());
  };

  const getOutputSheet = (source) => {
    const ss = source.getParent();
    const name = `${source.getName()} (Automation Output)`;
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, OUTPUT_HEADERS.length).setValues([OUTPUT_HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  };

  const formatSuggestions = (suggestions) => {
    if (!Array.isArray(suggestions)) return '';
    return suggestions.map((s, i) =>
      `${i + 1}. ${s.before || ''}\n   建議: ${s.afterAdjust || s.adjustAsFollows || ''}`
    ).join('\n\n');
  };

  const formatOutlineSummary = (outlineEntries) => {
    try {
      if (!Array.isArray(outlineEntries) || !outlineEntries.length) {
        dlog(`[formatOutlineSummary] 輸入不是陣列或為空: ${typeof outlineEntries}, length: ${outlineEntries?.length}`);
        return '';
      }

      const sections = [];
      let current = null;
      outlineEntries.forEach((entry, index) => {
        dlog(`[formatOutlineSummary] 處理項目 ${index}: ${JSON.stringify(entry)}`);
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

      const result = sections
        .map((section) => {
          const titleLine = `• ${String(section.title)}`;
          if (!section.items.length) return titleLine;
          const children = section.items.map((item) => `   - ${String(item)}`).join('\n');
          return `${titleLine}\n${children}`;
        })
        .join('\n');

      dlog(`[formatOutlineSummary] 最終結果: ${result.slice(0, 200)}...`);
      return result;
    } catch (e) {
      dlog(`[formatOutlineSummary] 錯誤: ${e.message}`);
      return `格式化錯誤: ${e.message}`;
    }
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

  const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

  const sanitizeMultiline = (value) => (value ? String(value).trim().replace(/\s+$/g, '') : '');



  // 保留必要的輔助函數
  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    const num = Number(String(value).replace(/[^\d.+-]/g, ''));
    return isFinite(num) ? num : null;
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

    // 特殊處理一些常見的欄位名稱
    const mappings = {
      'best_query': 'best_query',
      'best_query_clicks': 'best_query_clicks',
      'best_query_position': 'best_query_position',
      'best_query_volume': 'best_query_volume',
      'prev_best_query': 'prev_best_query',
      'prev_best_clicks': 'prev_best_clicks',
      'prev_best_position': 'prev_best_position',
      'prev_main_keyword': 'prev_main_keyword',
      'prev_keyword_rank': 'prev_keyword_rank',
      'prev_keyword_traffic': 'prev_keyword_traffic',
      'total_clicks': 'total_clicks',
      'keywords_1_10_count': 'keywords_1_10_count',
      'keywords_4_10_count': 'keywords_4_10_count',
      'total_keywords': 'total_keywords'
    };

    return mappings[normalized] || normalized;
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

    // 對應你的欄位名稱
    setString('bestQuery', ['best_query', 'Best Query']);
    setNumber('bestQueryClicks', ['best_query_clicks', 'Best Query Clicks']);
    setNumber('bestQueryPosition', ['best_query_position', 'Best Query Position']);
    setNumber('bestQueryVolume', ['best_query_volume', 'Best Query Volume']);

    setString('prevBestQuery', ['prev_best_query', 'Prev Best Query']);
    setNumber('prevBestClicks', ['prev_best_clicks', 'Prev Best Clicks']);
    setNumber('prevBestPosition', ['prev_best_position', 'Prev Best Position']);
    setString('prevMainKeyword', ['prev_main_keyword', 'Prev Main Keyword']);
    setNumber('prevKeywordRank', ['prev_keyword_rank', 'Prev Keyword Rank']);
    setNumber('prevKeywordTraffic', ['prev_keyword_traffic', 'Prev Keyword Traffic']);

    // 總計數據
    setNumber('totalClicks', ['total_clicks', 'Total Clicks']);
    setNumber('keywords1to10Count', ['keywords_1_10_count', 'Keywords 1-10 Count']);
    setNumber('keywords4to10Count', ['keywords_4_10_count', 'Keywords 4-10 Count']);
    setNumber('totalKeywords', ['total_keywords', 'Total Keywords']);

    // Rank 1-10 資料
    for (let i = 1; i <= 10; i++) {
      const key = `rank${i}`;
      const value = pickValue(rowData, [
        `rank_${i}`,
        `current_rank_${i}`,
        `Current Rank ${i}`,
        `Rank ${i}`
      ]);
      if (isNonEmpty(value)) source[key] = String(value);
    }

    // Rank >10 資料
    const rankGt10 = pickValue(rowData, ['rank_gt10', 'current_rank_gt10', 'Current Rank >10']);
    if (isNonEmpty(rankGt10)) source.rankGt10 = String(rankGt10);

    dlog(`[buildAnalyzeInputFromSheet] 構建的輸入: ${JSON.stringify(source, null, 2)}`);
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

function RL_AUTO_onOpenMenu() {
  RepostLensAutomation.createMenu();
}

function RL_AUTO_runForSheet() {
  RepostLensAutomation.runForSheet();
}

function RL_AUTO_runForActiveRow() {
  RepostLensAutomation.runForActiveRow();
}

function RL_AUTO_createTrigger() {
  RepostLensAutomation.createTrigger();
}



function RL_AUTO_deleteTrigger() {
  RepostLensAutomation.deleteTrigger();
}
