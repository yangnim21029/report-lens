// RepostLens content generator script
const RepostLensContentGenerator = (() => {
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
      .createMenu('RepostLens Content')
      .addItem('1. 生成段落描述 (當前列)', 'RL_CONTENT_generateDescriptionForActiveRow')
      .addItem('2. 拆分段落到新 Sheet', 'RL_CONTENT_splitParagraphsForActiveRow')
      .addItem('3. 生成對話內容 (異步)', 'RL_CONTENT_generateChatContentAsync')
      .addSeparator()
      .addItem('完整流程 (當前列)', 'RL_CONTENT_fullProcessForActiveRow')
      .addSeparator()
      .addItem('檢查 Output Sheet 格式', 'RL_CONTENT_checkOutputFormat')
      .addToUi();
    dlog('[onOpen] REPORT_API_BASE=' + API_BASE);
  };

  const checkOutputFormat = () => {
    const sheet = SpreadsheetApp.getActiveSheet();
    const validation = validateOutputSheetFormat(sheet);

    if (validation.isValid) {
      let message = `✅ Output Sheet 格式驗證通過！\n\n找到必要欄位：\n`;
      message += `- D 欄 (${validation.outlineColumn}): ${validation.outlineHeader}\n`;
      message += `- F 欄 (${validation.analysisColumn}): ${validation.analysisHeader}`;

      if (validation.contentColumn) {
        message += `\n- G 欄 (${validation.contentColumn}): ${validation.contentHeader} (已存在)`;
      } else {
        message += `\n\n將在 G 欄創建 "Generated Content" 欄位`;
      }

      SpreadsheetApp.getUi().alert(message);
    } else {
      SpreadsheetApp.getUi().alert(`❌ Output Sheet 格式驗證失敗！\n\n${validation.error}`);
    }
  };

  const generateDescriptionForActiveRow = () => {
    const sheet = SpreadsheetApp.getActiveSheet();

    // 驗證格式
    const validation = validateOutputSheetFormat(sheet);
    if (!validation.isValid) {
      SpreadsheetApp.getUi().alert(`Sheet 格式不正確: ${validation.error}`);
      return;
    }

    const activeCell = sheet.getActiveCell();
    const row = activeCell.getRow();
    if (row < 2) {
      SpreadsheetApp.getUi().alert('請選擇第 2 列以後的資料列');
      return;
    }

    dlog(`[generateDescriptionForActiveRow] 處理第 ${row} 列`);

    try {
      const result = processDescriptionGeneration(sheet, row, validation);
      const message = result.success
        ? `✅ 成功生成段落描述 (${result.contentLength} 字)`
        : `❌ 生成失敗: ${result.error}`;

      dlog(`[generateDescriptionForActiveRow] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 5);
    } catch (err) {
      const message = `處理錯誤: ${err.message}`;
      dlog(`[generateDescriptionForActiveRow] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 5);
    }
  };

  const splitParagraphsForActiveRow = () => {
    const sheet = SpreadsheetApp.getActiveSheet();
    const activeCell = sheet.getActiveCell();
    const row = activeCell.getRow();

    if (row < 2) {
      SpreadsheetApp.getUi().alert('請選擇第 2 列以後的資料列');
      return;
    }

    // 檢查是否有生成的描述內容 (G 欄)
    const descriptionContent = String(sheet.getRange(row, 7).getValue() || '').trim();
    if (!descriptionContent) {
      SpreadsheetApp.getUi().alert('請先生成段落描述 (步驟 1)');
      return;
    }

    try {
      const result = splitAndCreateParagraphSheet(sheet, row, descriptionContent);
      const message = result.success
        ? `✅ 成功拆分 ${result.paragraphCount} 個段落到新 Sheet`
        : `❌ 拆分失敗: ${result.error}`;

      dlog(`[splitParagraphsForActiveRow] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 5);
    } catch (err) {
      const message = `拆分錯誤: ${err.message}`;
      dlog(`[splitParagraphsForActiveRow] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 5);
    }
  };

  const generateChatContentAsync = () => {
    const sheet = SpreadsheetApp.getActiveSheet();

    // 檢查是否是段落 sheet
    if (!sheet.getName().includes('Paragraphs')) {
      SpreadsheetApp.getUi().alert('請切換到段落 Sheet (名稱包含 "Paragraphs")');
      return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      SpreadsheetApp.getUi().alert('段落 Sheet 沒有資料');
      return;
    }

    // 確認是否要處理所有段落
    const response = SpreadsheetApp.getUi().showYesNoDialog(
      'RepostLens Content',
      `確定要為所有 ${lastRow - 1} 個段落生成對話內容嗎？\n\n這可能需要較長時間。`,
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );

    if (response !== SpreadsheetApp.getUi().Button.YES) {
      return;
    }

    processChatContentAsync(sheet);
  };

  const fullProcessForActiveRow = () => {
    const sheet = SpreadsheetApp.getActiveSheet();

    // 驗證格式
    const validation = validateOutputSheetFormat(sheet);
    if (!validation.isValid) {
      SpreadsheetApp.getUi().alert(`Sheet 格式不正確: ${validation.error}`);
      return;
    }

    const activeCell = sheet.getActiveCell();
    const row = activeCell.getRow();
    if (row < 2) {
      SpreadsheetApp.getUi().alert('請選擇第 2 列以後的資料列');
      return;
    }

    SpreadsheetApp.getActive().toast('開始完整流程...', 'RepostLens Content', 3);

    try {
      // 步驟 1: 生成段落描述
      dlog(`[fullProcess] 步驟 1: 生成段落描述`);
      const descResult = processDescriptionGeneration(sheet, row, validation);
      if (!descResult.success) {
        throw new Error(`段落描述生成失敗: ${descResult.error}`);
      }

      SpreadsheetApp.getActive().toast('步驟 1 完成，開始拆分段落...', 'RepostLens Content', 2);

      // 步驟 2: 拆分段落
      dlog(`[fullProcess] 步驟 2: 拆分段落`);
      const descriptionContent = String(sheet.getRange(row, 7).getValue() || '').trim();
      const splitResult = splitAndCreateParagraphSheet(sheet, row, descriptionContent);
      if (!splitResult.success) {
        throw new Error(`段落拆分失敗: ${splitResult.error}`);
      }

      SpreadsheetApp.getActive().toast('步驟 2 完成，開始生成對話內容...', 'RepostLens Content', 2);

      // 步驟 3: 生成對話內容
      dlog(`[fullProcess] 步驟 3: 生成對話內容`);
      const paragraphSheet = splitResult.paragraphSheet;
      processChatContentAsync(paragraphSheet);

      const message = `✅ 完整流程啟動成功！\n已拆分 ${splitResult.paragraphCount} 個段落\n正在異步生成對話內容...`;
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 8);

    } catch (err) {
      const message = `完整流程錯誤: ${err.message}`;
      dlog(`[fullProcess] ${message}`);
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 8);
    }
  };

  const validateOutputSheetFormat = (sheet) => {
    try {
      const lastColumn = sheet.getLastColumn();
      if (lastColumn < 6) {
        return {
          isValid: false,
          error: '表格欄位不足，至少需要 6 欄 (A-F)'
        };
      }

      const headerValues = sheet.getRange(1, 1, 1, Math.max(lastColumn, 7)).getValues()[0] || [];

      // 檢查 D 欄 (Outline Summary)
      const outlineHeader = String(headerValues[3] || '').trim();
      if (!outlineHeader.includes('Outline') && !outlineHeader.includes('Summary')) {
        return {
          isValid: false,
          error: 'D 欄標題不正確，應該是 "Outline Summary"'
        };
      }

      // 檢查 F 欄 (Analysis Markdown)  
      const analysisHeader = String(headerValues[5] || '').trim();
      if (!analysisHeader.includes('Analysis') && !analysisHeader.includes('Markdown')) {
        return {
          isValid: false,
          error: 'F 欄標題不正確，應該是 "Analysis Markdown"'
        };
      }

      // 檢查 G 欄是否存在 (Generated Content)
      let contentColumn = null;
      let contentHeader = '';
      if (headerValues.length > 6) {
        contentHeader = String(headerValues[6] || '').trim();
        if (contentHeader) {
          contentColumn = 7; // G 欄
        }
      }

      return {
        isValid: true,
        outlineColumn: 4, // D 欄
        outlineHeader,
        analysisColumn: 6, // F 欄  
        analysisHeader,
        contentColumn,
        contentHeader
      };

    } catch (e) {
      return {
        isValid: false,
        error: `格式驗證失敗: ${e.message}`
      };
    }
  };

  const processDescriptionGeneration = (sheet, row, validation) => {
    // 讀取 D 欄 (Outline) 和 F 欄 (Analysis)
    const outlineText = String(sheet.getRange(row, validation.outlineColumn).getValue() || '').trim();
    const analysisText = String(sheet.getRange(row, validation.analysisColumn).getValue() || '').trim();

    if (!outlineText || !analysisText) {
      return {
        success: false,
        error: 'D 欄或 F 欄內容為空'
      };
    }

    dlog(`[processDescriptionGeneration] 第 ${row} 列 - Outline: ${outlineText.length} 字, Analysis: ${analysisText.length} 字`);

    // 調用內容生成 API
    const result = callContentGenerationAPI(analysisText, outlineText);

    if (!result.success) {
      return {
        success: false,
        error: result.error || '內容生成失敗'
      };
    }

    // 確保 G 欄存在
    ensureContentColumn(sheet, validation);

    // 寫入生成的內容到 G 欄
    const contentCell = sheet.getRange(row, 7); // G 欄
    const truncatedContent = truncateForCell(result.content, 50000);
    contentCell.setValue(truncatedContent);

    // 添加註解
    try {
      contentCell.setNote(`AI 生成內容 (${result.metadata?.contentLength || 0} 字)\n生成時間: ${new Date().toLocaleString()}`);
    } catch (e) {
      // 忽略註解錯誤
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      contentLength: result.metadata?.contentLength || 0
    };
  };

  const ensureContentColumn = (sheet, validation) => {
    if (validation.contentColumn) {
      return; // G 欄已存在
    }

    // 創建 G 欄標題
    const headerCell = sheet.getRange(1, 7);
    headerCell.setValue('Generated Content');

    // 設定格式
    try {
      headerCell.setFontWeight('bold');
      headerCell.setBackground('#f0f0f0');
    } catch (e) {
      // 忽略格式錯誤
    }

    dlog('[ensureContentColumn] 已創建 G 欄 "Generated Content"');
  };

  const callContentGenerationAPI = (analysisText, outlineText) => {
    const endpoint = getReportBase() + '/api/write/description';
    const payload = {
      analysisText,
      outlineText
    };

    dlog(`[callContentGenerationAPI] 調用內容生成 API: ${endpoint}`);

    try {
      const res = UrlFetchApp.fetch(endpoint, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const responseCode = res.getResponseCode();
      dlog(`[callContentGenerationAPI] API 回應: ${responseCode}`);

      if (responseCode < 200 || responseCode >= 300) {
        const errorText = res.getContentText();
        dlog(`[callContentGenerationAPI] API 錯誤: ${errorText.slice(0, 200)}`);
        throw new Error(`API 錯誤 ${responseCode}: ${errorText.slice(0, 100)}`);
      }

      const json = safeJson(res.getContentText());
      if (!json || json.success !== true) {
        throw new Error('API 回傳失敗');
      }

      dlog(`[callContentGenerationAPI] 成功生成內容: ${json.metadata?.contentLength || 0} 字`);
      return json;

    } catch (error) {
      dlog(`[callContentGenerationAPI] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const callChatAndStructureAPI = (paragraph, brand = '') => {
    const endpoint = getReportBase() + '/api/write/chat-and-structure';
    const payload = {
      paragraph,
      brand
    };

    dlog(`[callChatAndStructureAPI] 調用對話結構 API: ${endpoint}`);
    dlog(`[callChatAndStructureAPI] Brand: ${brand}, Paragraph length: ${paragraph.length}`);

    try {
      const res = UrlFetchApp.fetch(endpoint, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const responseCode = res.getResponseCode();
      dlog(`[callChatAndStructureAPI] API 回應: ${responseCode}`);

      if (responseCode < 200 || responseCode >= 300) {
        const errorText = res.getContentText();
        dlog(`[callChatAndStructureAPI] API 錯誤: ${errorText.slice(0, 200)}`);
        throw new Error(`API 錯誤 ${responseCode}: ${errorText.slice(0, 100)}`);
      }

      const json = safeJson(res.getContentText());
      if (!json || json.success !== true) {
        throw new Error('API 回傳失敗');
      }

      dlog(`[callChatAndStructureAPI] 成功生成對話內容: ${json.metadata?.contentLength || 0} 字`);
      return json;

    } catch (error) {
      dlog(`[callChatAndStructureAPI] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const splitAndCreateParagraphSheet = (sheet, row, descriptionContent) => {
    try {
      // 拆分段落 (以雙換行符號分割)
      const paragraphs = descriptionContent
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (paragraphs.length === 0) {
        return {
          success: false,
          error: '沒有找到可拆分的段落'
        };
      }

      // 創建新的 Sheet
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMdd_HHmm');
      const sheetName = `Row${row}_Paragraphs_${timestamp}`;

      const paragraphSheet = spreadsheet.insertSheet(sheetName);

      // 設定標題列
      const headers = ['Index', 'Paragraph', 'Brand', 'Generated Content'];
      paragraphSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // 設定標題格式
      const headerRange = paragraphSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');

      // 寫入段落資料
      const data = paragraphs.map((paragraph, index) => [
        index + 1,
        paragraph,
        '', // Brand 欄位留空，可手動填入
        ''  // Generated Content 欄位留空，待生成
      ]);

      if (data.length > 0) {
        paragraphSheet.getRange(2, 1, data.length, headers.length).setValues(data);
      }

      // 調整欄寬
      paragraphSheet.setColumnWidth(1, 60);  // Index
      paragraphSheet.setColumnWidth(2, 400); // Paragraph
      paragraphSheet.setColumnWidth(3, 100); // Brand
      paragraphSheet.setColumnWidth(4, 400); // Generated Content

      dlog(`[splitAndCreateParagraphSheet] 成功創建 Sheet: ${sheetName}, 段落數: ${paragraphs.length}`);

      return {
        success: true,
        paragraphCount: paragraphs.length,
        paragraphSheet: paragraphSheet,
        sheetName: sheetName
      };

    } catch (error) {
      dlog(`[splitAndCreateParagraphSheet] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const processChatContentAsync = (paragraphSheet) => {
    const lastRow = paragraphSheet.getLastRow();
    if (lastRow < 2) {
      SpreadsheetApp.getActive().toast('段落 Sheet 沒有資料', 'RepostLens Content', 3);
      return;
    }

    SpreadsheetApp.getActive().toast('開始異步生成對話內容...', 'RepostLens Content', 3);

    // 使用 time-driven trigger 來異步處理
    const functionName = 'RL_CONTENT_processChatContentBatch';
    const sheetId = paragraphSheet.getSheetId();

    // 儲存處理狀態到 PropertiesService
    const properties = PropertiesService.getScriptProperties();
    properties.setProperties({
      'CHAT_PROCESS_SHEET_ID': String(sheetId),
      'CHAT_PROCESS_CURRENT_ROW': '2',
      'CHAT_PROCESS_TOTAL_ROWS': String(lastRow),
      'CHAT_PROCESS_START_TIME': String(Date.now())
    });

    // 創建 trigger
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(1000) // 1 秒後開始
      .create();

    dlog(`[processChatContentAsync] 已設定異步處理 trigger, Sheet ID: ${sheetId}, 總列數: ${lastRow}`);
  };

  // === 輔助函數 ===

  const truncateForCell = (value, maxLen = 50000) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
  };

  const getReportBase = () => {
    if (!API_BASE) throw new Error('請在 Script properties 設定 REPORT_API_BASE');
    return API_BASE.replace(/\/$/, '');
  };

  const safeJson = (s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  };

  return {
    createMenu,
    checkOutputFormat,
    generateDescriptionForActiveRow,
    splitParagraphsForActiveRow,
    generateChatContentAsync,
    fullProcessForActiveRow,
    processChatContentBatch: (sheetId, currentRow) => {
      // 這個函數會被 trigger 調用
      try {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = spreadsheet.getSheets().find(s => s.getSheetId() === sheetId);

        if (!sheet) {
          throw new Error(`找不到 Sheet ID: ${sheetId}`);
        }

        const properties = PropertiesService.getScriptProperties();
        const totalRows = parseInt(properties.getProperty('CHAT_PROCESS_TOTAL_ROWS') || '0');

        if (currentRow > totalRows) {
          // 處理完成
          properties.deleteProperty('CHAT_PROCESS_SHEET_ID');
          properties.deleteProperty('CHAT_PROCESS_CURRENT_ROW');
          properties.deleteProperty('CHAT_PROCESS_TOTAL_ROWS');
          properties.deleteProperty('CHAT_PROCESS_START_TIME');

          SpreadsheetApp.getActive().toast('✅ 所有對話內容生成完成！', 'RepostLens Content', 5);
          return;
        }

        // 處理當前列
        const paragraph = String(sheet.getRange(currentRow, 2).getValue() || '').trim();
        const brand = String(sheet.getRange(currentRow, 3).getValue() || '').trim();

        if (paragraph) {
          const result = callChatAndStructureAPI(paragraph, brand);

          if (result.success) {
            const contentCell = sheet.getRange(currentRow, 4);
            const truncatedContent = truncateForCell(result.content, 50000);
            contentCell.setValue(truncatedContent);

            try {
              contentCell.setNote(`對話內容 (${result.metadata?.contentLength || 0} 字)\n生成時間: ${new Date().toLocaleString()}`);
            } catch (e) {
              // 忽略註解錯誤
            }
          }
        }

        // 更新進度並設定下一次處理
        const nextRow = currentRow + 1;
        properties.setProperty('CHAT_PROCESS_CURRENT_ROW', String(nextRow));

        // 設定下一次 trigger (延遲 2 秒避免 API 限制)
        ScriptApp.newTrigger('RL_CONTENT_processChatContentBatch')
          .timeBased()
          .after(2000)
          .create();

        const progress = Math.round(((currentRow - 1) / (totalRows - 1)) * 100);
        SpreadsheetApp.getActive().toast(`處理進度: ${progress}% (${currentRow - 1}/${totalRows - 1})`, 'RepostLens Content', 2);

      } catch (error) {
        dlog(`[processChatContentBatch] 錯誤: ${error.message}`);
        SpreadsheetApp.getActive().toast(`批次處理錯誤: ${error.message}`, 'RepostLens Content', 5);
      }
    }
  };
})();

function RL_CONTENT_onOpenMenu() {
  RepostLensContentGenerator.createMenu();
}

function RL_CONTENT_generateDescriptionForActiveRow() {
  RepostLensContentGenerator.generateDescriptionForActiveRow();
}

function RL_CONTENT_splitParagraphsForActiveRow() {
  RepostLensContentGenerator.splitParagraphsForActiveRow();
}

function RL_CONTENT_generateChatContentAsync() {
  RepostLensContentGenerator.generateChatContentAsync();
}

function RL_CONTENT_fullProcessForActiveRow() {
  RepostLensContentGenerator.fullProcessForActiveRow();
}

function RL_CONTENT_checkOutputFormat() {
  RepostLensContentGenerator.checkOutputFormat();
}

function RL_CONTENT_processChatContentBatch() {
  const properties = PropertiesService.getScriptProperties();
  const sheetId = parseInt(properties.getProperty('CHAT_PROCESS_SHEET_ID') || '0');
  const currentRow = parseInt(properties.getProperty('CHAT_PROCESS_CURRENT_ROW') || '2');

  if (sheetId && currentRow) {
    RepostLensContentGenerator.processChatContentBatch(sheetId, currentRow);
  }
}