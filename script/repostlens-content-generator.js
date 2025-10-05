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
      .addItem('🚀 完整流程 (當前列)', 'RL_CONTENT_fullProcessForActiveRow')
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
      const splitResult = splitAndCreateParagraphSheet(sheet, row, descriptionContent, validation);
      if (!splitResult.success) {
        throw new Error(`段落拆分失敗: ${splitResult.error}`);
      }

      SpreadsheetApp.getActive().toast('步驟 2 完成，開始生成對話內容...', 'RepostLens Content', 2);

      // 步驟 3: 生成對話內容
      dlog(`[fullProcess] 步驟 3: 生成對話內容`);
      const paragraphSheet = splitResult.paragraphSheet;
      const chatResult = processChatContentSync(paragraphSheet);
      
      if (!chatResult.success) {
        throw new Error(`對話內容生成失敗: ${chatResult.error}`);
      }

      SpreadsheetApp.getActive().toast('步驟 3 完成，開始生成最終內容...', 'RepostLens Content', 2);

      // 步驟 4: 生成最終內容
      dlog(`[fullProcess] 步驟 4: 生成最終內容`);
      const finalResult = processFinalContentSync(paragraphSheet);
      
      if (!finalResult.success) {
        throw new Error(`最終內容生成失敗: ${finalResult.error}`);
      }

      const message = `✅ 完整流程完成！\n已拆分 ${splitResult.paragraphCount} 個段落\n生成對話內容: ${chatResult.successCount}/${chatResult.totalCount}\n生成最終內容: ${finalResult.successCount}/${finalResult.totalCount}`;
      SpreadsheetApp.getActive().toast(message, 'RepostLens Content', 10);

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

      const headerValues = sheet.getRange(1, 1, 1, Math.max(lastColumn, 8)).getValues()[0] || [];

      // 檢查 A 欄 (URL)
      const urlHeader = String(headerValues[0] || '').trim();
      let urlColumn = null;
      if (urlHeader.toLowerCase().includes('url') || urlHeader.toLowerCase().includes('link')) {
        urlColumn = 1; // A 欄
      }

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
        urlColumn,
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

    // 添加註解，包含段落資訊
    try {
      const paragraphCount = result.paragraphs ? result.paragraphs.length : 0;
      contentCell.setNote(`AI 生成內容 (${result.metadata?.contentLength || 0} 字)\n段落數: ${paragraphCount}\n生成時間: ${new Date().toLocaleString()}`);
    } catch (e) {
      // 忽略註解錯誤
    }

    // 儲存段落資訊到 PropertiesService 以供後續使用
    if (result.paragraphs && result.paragraphs.length > 0) {
      const properties = PropertiesService.getScriptProperties();
      properties.setProperty(`PARAGRAPHS_ROW_${row}`, JSON.stringify(result.paragraphs));
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

  const callChatAndStructureBatchAPI = (paragraphs, brand = '') => {
    const endpoint = getReportBase() + '/api/write/chat-and-structure';
    const payload = {
      paragraphs,
      brand
    };

    dlog(`[callChatAndStructureBatchAPI] 調用批量對話結構 API: ${endpoint}`);
    dlog(`[callChatAndStructureBatchAPI] Brand: ${brand}, Paragraphs count: ${paragraphs.length}`);

    try {
      const res = UrlFetchApp.fetch(endpoint, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const responseCode = res.getResponseCode();
      dlog(`[callChatAndStructureBatchAPI] API 回應: ${responseCode}`);

      if (responseCode < 200 || responseCode >= 300) {
        const errorText = res.getContentText();
        dlog(`[callChatAndStructureBatchAPI] API 錯誤: ${errorText.slice(0, 200)}`);
        throw new Error(`API 錯誤 ${responseCode}: ${errorText.slice(0, 100)}`);
      }

      const json = safeJson(res.getContentText());
      if (!json || json.success !== true) {
        throw new Error('API 回傳失敗');
      }

      dlog(`[callChatAndStructureBatchAPI] 成功生成批量對話內容: ${json.metadata?.successCount}/${json.metadata?.totalParagraphs}`);
      return json;

    } catch (error) {
      dlog(`[callChatAndStructureBatchAPI] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const callFinalContentAPI = (paragraphOutput, generateContentOutput) => {
    const endpoint = getReportBase() + '/api/write/final-content';
    const payload = {
      paragraphOutput,
      generateContentOutput
    };

    dlog(`[callFinalContentAPI] 調用最終內容 API: ${endpoint}`);

    try {
      const res = UrlFetchApp.fetch(endpoint, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const responseCode = res.getResponseCode();
      dlog(`[callFinalContentAPI] API 回應: ${responseCode}`);

      if (responseCode < 200 || responseCode >= 300) {
        const errorText = res.getContentText();
        dlog(`[callFinalContentAPI] API 錯誤: ${errorText.slice(0, 200)}`);
        throw new Error(`API 錯誤 ${responseCode}: ${errorText.slice(0, 100)}`);
      }

      const json = safeJson(res.getContentText());
      if (!json || json.success !== true) {
        throw new Error('API 回傳失敗');
      }

      dlog(`[callFinalContentAPI] 成功生成最終內容: ${json.metadata?.contentLength || 0} 字`);
      return json;

    } catch (error) {
      dlog(`[callFinalContentAPI] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const splitAndCreateParagraphSheet = (sheet, row, _descriptionContent, validation) => {
    try {
      // 獲取 URL (如果有的話)
      let sourceUrl = '';
      if (validation.urlColumn) {
        sourceUrl = String(sheet.getRange(row, validation.urlColumn).getValue() || '').trim();
      }

      // 從 PropertiesService 獲取 API 返回的段落列表
      let paragraphs = [];

      const properties = PropertiesService.getScriptProperties();
      const storedParagraphs = properties.getProperty(`PARAGRAPHS_ROW_${row}`);

      if (storedParagraphs) {
        paragraphs = JSON.parse(storedParagraphs);
        dlog(`[splitAndCreateParagraphSheet] 使用 API 返回的段落列表，共 ${paragraphs.length} 個段落`);

        // 清理已使用的資料
        properties.deleteProperty(`PARAGRAPHS_ROW_${row}`);
      } else {
        return {
          success: false,
          error: '找不到 API 生成的段落資料，請重新生成段落描述'
        };
      }

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

      // 動態生成標題列
      const headers = ['Type', 'URL', 'Brand'];
      const paragraphHeaders = paragraphs.map((_, index) => `paragraph_${index + 1}`);

      headers.push(...paragraphHeaders);

      paragraphSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // 設定標題格式
      const headerRange = paragraphSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');

      // 準備段落資料列 (第 2 列)
      const paragraphRow = ['paragraph_output', sourceUrl, '']; // Type, URL, Brand

      // 添加段落內容
      paragraphs.forEach(paragraph => {
        paragraphRow.push(paragraph);
      });

      // 準備內容資料列 (第 3 列)
      const contentRow = ['generate_content_output', sourceUrl, '']; // Type, URL, Brand (空)

      // 添加空的 paragraph 欄位 (待生成對話內容)
      paragraphs.forEach(() => {
        contentRow.push('');
      });

      // 寫入兩列資料
      const allData = [paragraphRow, contentRow];
      paragraphSheet.getRange(2, 1, 2, paragraphRow.length).setValues(allData);

      // 調整欄寬
      paragraphSheet.setColumnWidth(1, 150); // Type
      paragraphSheet.setColumnWidth(2, 200); // URL
      paragraphSheet.setColumnWidth(3, 100); // Brand

      // 段落欄位
      for (let i = 0; i < paragraphs.length; i++) {
        paragraphSheet.setColumnWidth(4 + i, 400);
      }

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



  const processChatContentSync = (paragraphSheet) => {
    const lastRow = paragraphSheet.getLastRow();
    if (lastRow < 2) {
      SpreadsheetApp.getActive().toast('段落 Sheet 沒有資料', 'RepostLens Content', 3);
      return;
    }

    // 分析 sheet 結構來找出段落欄位
    const headers = paragraphSheet.getRange(1, 1, 1, paragraphSheet.getLastColumn()).getValues()[0];
    const paragraphColumns = [];

    headers.forEach((header, index) => {
      const headerStr = String(header || '').toLowerCase();
      if (headerStr.startsWith('paragraph_')) {
        paragraphColumns.push(index + 1);
      }
    });

    dlog(`[processChatContentAsync] 找到段落欄位: ${paragraphColumns.join(', ')}`);
    dlog(`[processChatContentAsync] 標題列: ${headers.join(', ')}`);

    if (paragraphColumns.length === 0) {
      SpreadsheetApp.getActive().toast('找不到段落欄位 (paragraph_*)', 'RepostLens Content', 5);
      return;
    }

    SpreadsheetApp.getActive().toast('開始批量生成對話內容...', 'RepostLens Content', 3);

    try {
      // 讀取所有段落內容 (從第 2 列讀取段落)
      const paragraphs = [];
      const brand = String(paragraphSheet.getRange(2, 3).getValue() || '').trim(); // Brand 在第 3 欄

      paragraphColumns.forEach(column => {
        const paragraph = String(paragraphSheet.getRange(2, column).getValue() || '').trim();
        paragraphs.push(paragraph);
      });

      // 過濾空段落
      const validParagraphs = paragraphs.filter(p => p.length > 0);

      if (validParagraphs.length === 0) {
        SpreadsheetApp.getActive().toast('沒有找到有效的段落內容', 'RepostLens Content', 5);
        return;
      }

      dlog(`[processChatContentAsync] 準備處理 ${validParagraphs.length} 個段落`);

      // 調用批量 API
      const result = callChatAndStructureBatchAPI(validParagraphs, brand);

      if (!result.success) {
        throw new Error(result.error || '批量處理失敗');
      }

      // 寫入結果到對應的 paragraph 欄位 (第 3 列)
      result.results.forEach((res, index) => {
        if (index < paragraphColumns.length && res.success) {
          const paragraphColumn = paragraphColumns[index];
          dlog(`[processChatContentAsync] 寫入內容到第 3 列，第 ${paragraphColumn} 欄`);

          const contentCell = paragraphSheet.getRange(3, paragraphColumn);
          const truncatedContent = truncateForCell(res.content, 50000);
          contentCell.setValue(truncatedContent);

          try {
            contentCell.setNote(`對話內容 (${res.metadata?.contentLength || 0} 字)\n生成時間: ${new Date().toLocaleString()}`);
          } catch (e) {
            // 忽略註解錯誤
          }

          dlog(`[processChatContentAsync] 成功寫入 ${truncatedContent.length} 字符到 paragraph_${index + 1}`);
        } else if (index < paragraphColumns.length && !res.success) {
          dlog(`[processChatContentAsync] 段落 ${index + 1} 處理失敗: ${res.error}`);
        }
      });

      SpreadsheetApp.flush();

      const successCount = result.metadata?.successCount || 0;
      const totalCount = result.metadata?.totalParagraphs || 0;

      dlog(`[processChatContentSync] 成功生成 ${successCount}/${totalCount} 個對話內容`);

      return {
        success: true,
        successCount: successCount,
        totalCount: totalCount
      };

    } catch (error) {
      dlog(`[processChatContentSync] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const processFinalContentSync = (paragraphSheet) => {
    const lastRow = paragraphSheet.getLastRow();
    if (lastRow < 3) {
      SpreadsheetApp.getActive().toast('段落 Sheet 資料不足', 'RepostLens Content', 3);
      return;
    }

    // 分析 sheet 結構來找出段落欄位
    const headers = paragraphSheet.getRange(1, 1, 1, paragraphSheet.getLastColumn()).getValues()[0];
    const paragraphColumns = [];

    headers.forEach((header, index) => {
      const headerStr = String(header || '').toLowerCase();
      if (headerStr.startsWith('paragraph_')) {
        paragraphColumns.push(index + 1);
      }
    });

    if (paragraphColumns.length === 0) {
      SpreadsheetApp.getActive().toast('找不到段落欄位 (paragraph_*)', 'RepostLens Content', 5);
      return;
    }

    SpreadsheetApp.getActive().toast('開始批量生成最終內容...', 'RepostLens Content', 3);

    try {
      // 讀取 paragraph_output (第 2 列) 和 generate_content_output (第 3 列)
      const paragraphOutputs = [];
      const generateContentOutputs = [];

      paragraphColumns.forEach(column => {
        const paragraphOutput = String(paragraphSheet.getRange(2, column).getValue() || '').trim();
        const generateContentOutput = String(paragraphSheet.getRange(3, column).getValue() || '').trim();
        
        paragraphOutputs.push(paragraphOutput);
        generateContentOutputs.push(generateContentOutput);
      });

      dlog(`[processFinalContentAsync] 準備處理 ${paragraphColumns.length} 個段落`);

      // 為每個段落生成最終內容
      const finalContents = [];
      let successCount = 0;

      for (let i = 0; i < paragraphColumns.length; i++) {
        if (paragraphOutputs[i] && generateContentOutputs[i]) {
          const result = callFinalContentAPI(paragraphOutputs[i], generateContentOutputs[i]);
          
          if (result.success) {
            finalContents.push(result.finalContent);
            successCount++;
            dlog(`[processFinalContentAsync] 段落 ${i + 1} 處理成功`);
          } else {
            finalContents.push('');
            dlog(`[processFinalContentAsync] 段落 ${i + 1} 處理失敗: ${result.error}`);
          }
        } else {
          finalContents.push('');
          dlog(`[processFinalContentAsync] 段落 ${i + 1} 資料不完整，跳過`);
        }
      }

      // 創建第 4 列來存放最終內容
      const finalRow = ['final_content_output', '', '']; // Type, URL, Brand
      
      finalContents.forEach(content => {
        finalRow.push(content);
      });

      // 寫入第 4 列
      paragraphSheet.getRange(4, 1, 1, finalRow.length).setValues([finalRow]);

      SpreadsheetApp.flush();

      dlog(`[processFinalContentSync] 成功生成 ${successCount}/${paragraphColumns.length} 個最終內容`);

      return {
        success: true,
        successCount: successCount,
        totalCount: paragraphColumns.length
      };

    } catch (error) {
      dlog(`[processFinalContentSync] 錯誤: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
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
    fullProcessForActiveRow,
  };
})();

function RL_CONTENT_onOpenMenu() {
  RepostLensContentGenerator.createMenu();
}

function RL_CONTENT_fullProcessForActiveRow() {
  RepostLensContentGenerator.fullProcessForActiveRow();
}

function RL_CONTENT_checkOutputFormat() {
  RepostLensContentGenerator.checkOutputFormat();
}
