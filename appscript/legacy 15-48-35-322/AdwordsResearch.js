function onOpen() {
  const ui = SpreadsheetApp.getUi(); // 先將 UI 物件存起來

  ui.createMenu('RepostLens')
    .addItem(`AI開優化建議(所有列) (${TARGET_SHEET_NAME})`, 'runForSheet')
    .addItem(`AI開優化建議(當前列) (${TARGET_SHEET_NAME})`, 'runForActiveRow')
    .addToUi();

  // dlog('[onOpen] REPORT_API_BASE=' + REPORT_API_BASE);

  ui.createMenu('Audit')
    .addItem(`檢查`, 'PageLens_InitializeColumns')
    .addToUi();
}


/**
 * 網站關鍵字覆蓋率查詢工具 (v7 - D 欄為 AI 排除)
 *
 * 1. 讀取 A 欄網址，查詢關鍵字覆蓋率。
 * 2. B 欄寫入「已覆蓋關鍵字」(含 GSC 數據)。
 * 3. 呼叫 OpenAI，傳入包含排名、點擊、曝光的數據，分析「未覆蓋關鍵字」列表。
 * 4. 將 OpenAI「挑選出」的關鍵字（保留原始搜尋量）寫入 C 欄。
 * 5. 將被 AI「過濾掉」的其餘未覆蓋關鍵字寫入 D 欄。
 */

// --- 設定區塊 ---
// !! 請將 "YOUR_OPENAI_API_KEY" 替換成您自己的 OpenAI API 金鑰 !!
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
const OPENAI_MODEL = "gpt-4.1-mini"; // 您可以根據需求更換為 "gpt-4o" 等模型

function fetchKeywordData() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("試算表中沒有足夠的網址資料。請在 A 欄位輸入網址。");
    return;
  }

  const urlRange = sheet.getRange(2, 1, lastRow - 1, 1);
  const urls = urlRange.getValues();
  const apiBaseUrl = "https://keyword-lens.vercel.app/api/url/coverage?url=";

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i][0];
    const trimmedUrl = url ? url.toString().trim() : '';
    const currentRow = i + 2;

    // 清除舊資料 (B, C, D 欄)，避免上次執行的殘留
    sheet.getRange(currentRow, 2, 1, 3).clearContent();

    if (!trimmedUrl) {
      Logger.log(`第 ${currentRow} 行的內容為空，跳過。`);
      continue;
    }

    Logger.log(`正在處理網址：${trimmedUrl}`);

    try {
      const response = UrlFetchApp.fetch(apiBaseUrl + encodeURIComponent(trimmedUrl), { 'muteHttpExceptions': true });
      const jsonResponse = response.getContentText();
      const data = JSON.parse(jsonResponse);

      if (data.success) {
        // --- 處理 B 欄：已覆蓋關鍵字 ---
        let coveredKeywords = "無";
        if (data.covered && data.covered.length > 0) {
          coveredKeywords = data.covered.map(item => {
            if (item.gsc) {
              const avgPosition = item.gsc.avgPosition ? item.gsc.avgPosition.toFixed(1) : 'N/A';
              return `${item.text} (SV: ${item.searchVolume}, Clicks: ${item.gsc.clicks}, Imp: ${item.gsc.impressions}, Pos: ${avgPosition})`;
            } else {
              return `${item.text} (${item.searchVolume})`;
            }
          }).join("\n");
        }
        sheet.getRange(currentRow, 2).setValue(coveredKeywords);
        Logger.log(`網址 ${trimmedUrl} [B 欄] 已覆蓋關鍵字處理成功。`);

        // --- 處理 C 欄 (AI 精選) 和 D 欄 (AI 排除) ---
        const hasCovered = data.covered && data.covered.length > 0;
        const hasUncovered = data.uncovered && data.uncovered.length > 0;

        // 預設值
        let finalColumnCValue = "無";
        let finalColumnDValue = "無";

        if (hasCovered && hasUncovered) {
          Logger.log(`正在為網址 ${trimmedUrl} 取得 OpenAI 建議...`);
          const suggestedKeywords = getOpenAISuggestions(data.covered, data.uncovered);
          Logger.log(`從 OpenAI 收到建議: ${suggestedKeywords}`);

          const hasValidSuggestions = suggestedKeywords && suggestedKeywords !== "N/A" && suggestedKeywords !== "無建議" && !suggestedKeywords.includes("錯誤");

          if (hasValidSuggestions) {
            const suggestedKeywordsSet = new Set(suggestedKeywords.split('\n').map(kw => kw.trim()));

            // C 欄: AI 精選的關鍵字
            const aiSelectedArray = data.uncovered.filter(item => suggestedKeywordsSet.has(item.text));
            if (aiSelectedArray.length > 0) {
              finalColumnCValue = aiSelectedArray.map(item => `${item.text} (${item.searchVolume})`).join("\n");
            } else {
              finalColumnCValue = "無 AI 建議";
            }

            // D 欄: 被 AI 過濾掉的關鍵字
            const filteredOutArray = data.uncovered.filter(item => !suggestedKeywordsSet.has(item.text));
            if (filteredOutArray.length > 0) {
              finalColumnDValue = filteredOutArray.map(item => `${item.text} (${item.searchVolume})`).join("\n");
            }

          } else {
            // 如果 OpenAI 出錯或回傳無建議，C 欄顯示其結果
            finalColumnCValue = suggestedKeywords;
            // D 欄則顯示所有未覆蓋的關鍵字，因為沒有任何詞被 AI "精選"
            finalColumnDValue = data.uncovered.map(item => `${item.text} (${item.searchVolume})`).join("\n");
          }
        }

        // 將最終結果寫入 C 和 D 欄
        sheet.getRange(currentRow, 3).setValue(finalColumnCValue);
        sheet.getRange(currentRow, 4).setValue(finalColumnDValue);
        Logger.log(`網址 ${trimmedUrl} [C, D 欄] AI 建議與排除關鍵字已寫入。`);

      } else {
        Logger.log(`API 請求失敗，網址: ${trimmedUrl}`);
        sheet.getRange(currentRow, 2, 1, 3).setValue("API 錯誤");
      }

    } catch (e) {
      Logger.log(`處理網址時發生錯誤: ${trimmedUrl}, 錯誤訊息: ${e.message}`);
      // B, C, D 欄都寫入錯誤
      sheet.getRange(currentRow, 2, 1, 3).setValue("處理錯誤");
    }
  }
}


/**
 * 【已更新】呼叫 OpenAI API 以取得基於 GSC 數據的關鍵字建議
 * @param {Array} coveredKeywordsArray - 已覆蓋關鍵字的物件陣列 (包含 GSC 數據)
 * @param {Array} uncoveredKeywordsArray - 未覆蓋關鍵字的物件陣列
 * @returns {String} - 由 OpenAI 產生並以換行符號分隔的建議關鍵字列表
 */
function getOpenAISuggestions(coveredKeywordsArray, uncoveredKeywordsArray) {
  if (OPENAI_API_KEY === "YOUR_OPENAI_API_KEY" || !OPENAI_API_KEY) {
    Logger.log("OpenAI API 金鑰未設定。");
    return "請先設定 API Key";
  }

  const coveredText = coveredKeywordsArray.map(item => {
    if (item.gsc) {
      const avgPosition = item.gsc.avgPosition ? item.gsc.avgPosition.toFixed(1) : 'N/A';
      return `${item.text} (排名: ${avgPosition}, 點擊: ${item.gsc.clicks}, 曝光: ${item.gsc.impressions})`;
    } else {
      return `${item.text} (搜尋量: ${item.searchVolume})`;
    }
  }).join("\n");

  const uncoveredText = uncoveredKeywordsArray.map(k => `${k.text} (搜尋量: ${k.searchVolume})`).join('\n');

  const prompt = `
你是一位頂尖的 SEO 內容策略師。你的任務是分析一份網頁的關鍵字成效報告，並從「未覆蓋關鍵字」列表中，智慧地挑選出最有潛力的新關鍵字，以擴展內容的深度與廣度。

# 背景資訊
- **已覆蓋關鍵字 (Covered Keywords):**
  - 這份列表顯示我的網頁目前已在 Google 獲得排名的關鍵字。
  - 格式為：\`關鍵字 (排名: [平均排名], 點擊: [點擊數], 曝光: [曝光數])\`。
  - **排名 (Position):** 數字越小代表排名越好。這是判斷核心主題的關鍵指標。
  - **曝光 (Impressions):** 代表這個關鍵字在 Google 搜尋結果中被看見的次數。高曝光代表市場需求大。
  - **點擊 (Clicks):** 代表使用者實際點擊進入我網站的次數。
  - 這些數據共同描繪出我網頁的「主題權威」所在。請特別關注排名好（數字小）、曝光高或點擊高的關鍵字，它們最能代表本頁的核心主題。

- **未覆蓋關鍵字 (Uncovered Keywords):**
  - 這份列表包含與我的主題相關，但我尚未獲得排名，或排名很差的關鍵字。
  - 格式為：\`關鍵字 (搜尋量: [每月平均搜尋量])\`。
  - 這是我們尋找新內容機會的目標池。

# 你的任務
請仔細分析「已覆蓋關鍵字」的成效數據，深入理解該網頁的核心主題與強項。然後，從「未覆蓋關鍵字」列表中，挑選出最符合以下條件的字詞：
1.  **主題延伸:** 挑選與「已覆蓋關鍵字」中表現強勁（特別是排名好、曝光高）的關鍵字有高度語意關聯的子議題。
2.  **搜尋意圖鏈結:** 找出搜尋「已覆蓋關鍵字」的使用者，下一步可能會搜尋的延伸問題或詞彙。
3.  **同義詞與變體:** 識別出核心主題的同義詞、長尾變體或意圖相近的詞。

# 關鍵字列表
- **已覆蓋關鍵字:**
${coveredText}

- **未覆蓋關鍵字:**
${uncoveredText}

# 輸出格式要求
- 請直接列出你從「未覆蓋關鍵字」中挑選出的關鍵字（僅需關鍵字本身，不要包含搜尋量）。
- 每個關鍵字佔一行（用 \`\\n\` 分隔）。
- **絕對不要**包含任何額外的解釋、前言、標題或編號。
- 如果你分析後認為沒有任何值得推薦的關鍵字，請只回傳「無建議」。
  `;

  const apiEndpoint = "https://api.openai.com/v1/chat/completions";
  const payload = {
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt, }],
    temperature: 0.2,
    max_tokens: 300,
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + OPENAI_API_KEY, },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(apiEndpoint, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode === 200) {
    const parsedResponse = JSON.parse(responseBody);
    if (parsedResponse.choices && parsedResponse.choices.length > 0) {
      return parsedResponse.choices[0].message.content.trim();
    }
    return "OpenAI 回應格式錯誤";
  } else {
    Logger.log(`OpenAI API 錯誤: ${responseCode} - ${responseBody}`);
    return `OpenAI API 錯誤 (${responseCode})`;
  }
}
