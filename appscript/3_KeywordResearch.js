// ============================================================
// 3_KeywordResearch.js - 關鍵字研究完整功能模組
// ============================================================
// 此檔案合併了 AdwordsResearch 和 UrlFindKeyword 兩個功能
// 依賴: 0_Common.js (Config, Utils, ApiClient, SheetHelper)
// ============================================================

// ============================================================
// AdwordsResearch - Adwords 關鍵字覆蓋率分析
// ============================================================
var AdwordsResearch = (function () {
    'use strict';

    // OpenAI API 配置
    var OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || '';
    var OPENAI_MODEL = 'gpt-4o-mini';

    /**
     * 主要處理函數 - 獲取關鍵字數據並使用 AI 分析
     */
    function fetchKeywordData() {
        var sheet = SheetHelper.getActiveSheet();
        var lastRow = sheet.getLastRow();

        if (lastRow < 2) {
            SheetHelper.showAlert('試算表中沒有足夠的網址資料。請在 A 欄位輸入網址。');
            return;
        }

        var urlRange = sheet.getRange(2, 1, lastRow - 1, 1);
        var urls = urlRange.getValues();
        var apiBaseUrl = 'https://keyword-lens.vercel.app/api/url/coverage?url=';

        for (var i = 0; i < urls.length; i++) {
            var url = urls[i][0];
            var trimmedUrl = url ? url.toString().trim() : '';
            var currentRow = i + 2;

            // 清除舊資料 (B, C, D 欄)
            sheet.getRange(currentRow, 2, 1, 3).clearContent();

            if (!trimmedUrl) {
                Utils.log('第 ' + currentRow + ' 行的內容為空，跳過');
                continue;
            }

            Utils.log('正在處理網址：' + trimmedUrl);

            try {
                var response = ApiClient.get(apiBaseUrl + encodeURIComponent(trimmedUrl));
                var data = response.json();

                if (data && data.success) {
                    // 處理 B 欄：已覆蓋關鍵字
                    var coveredKeywords = '無';
                    if (data.covered && data.covered.length > 0) {
                        var coveredList = [];
                        for (var j = 0; j < data.covered.length; j++) {
                            var item = data.covered[j];
                            if (item.gsc) {
                                var avgPosition = item.gsc.avgPosition ? item.gsc.avgPosition.toFixed(1) : 'N/A';
                                coveredList.push(item.text + ' (SV: ' + item.searchVolume + ', Clicks: ' + item.gsc.clicks + ', Imp: ' + item.gsc.impressions + ', Pos: ' + avgPosition + ')');
                            } else {
                                coveredList.push(item.text + ' (' + item.searchVolume + ')');
                            }
                        }
                        coveredKeywords = coveredList.join('\n');
                    }
                    sheet.getRange(currentRow, 2).setValue(coveredKeywords);

                    // 處理 C 欄 (AI 精選) 和 D 欄 (AI 排除)
                    var hasCovered = data.covered && data.covered.length > 0;
                    var hasUncovered = data.uncovered && data.uncovered.length > 0;

                    var finalColumnCValue = '無';
                    var finalColumnDValue = '無';

                    if (hasCovered && hasUncovered) {
                        Utils.log('正在為網址 ' + trimmedUrl + ' 取得 OpenAI 建議...');
                        var suggestedKeywords = getOpenAISuggestions(data.covered, data.uncovered);

                        var hasValidSuggestions = suggestedKeywords &&
                            suggestedKeywords !== 'N/A' &&
                            suggestedKeywords !== '無建議' &&
                            suggestedKeywords.indexOf('錯誤') === -1;

                        if (hasValidSuggestions) {
                            var suggestedKeywordsArray = suggestedKeywords.split('\n').map(function (kw) { return kw.trim(); });
                            var suggestedKeywordsSet = {};
                            for (var k = 0; k < suggestedKeywordsArray.length; k++) {
                                suggestedKeywordsSet[suggestedKeywordsArray[k]] = true;
                            }

                            // C 欄: AI 精選的關鍵字
                            var aiSelectedArray = [];
                            for (var k = 0; k < data.uncovered.length; k++) {
                                if (suggestedKeywordsSet[data.uncovered[k].text]) {
                                    aiSelectedArray.push(data.uncovered[k]);
                                }
                            }

                            if (aiSelectedArray.length > 0) {
                                var selectedList = [];
                                for (var k = 0; k < aiSelectedArray.length; k++) {
                                    selectedList.push(aiSelectedArray[k].text + ' (' + aiSelectedArray[k].searchVolume + ')');
                                }
                                finalColumnCValue = selectedList.join('\n');
                            } else {
                                finalColumnCValue = '無 AI 建議';
                            }

                            // D 欄: 被 AI 過濾掉的關鍵字
                            var filteredOutArray = [];
                            for (var k = 0; k < data.uncovered.length; k++) {
                                if (!suggestedKeywordsSet[data.uncovered[k].text]) {
                                    filteredOutArray.push(data.uncovered[k]);
                                }
                            }

                            if (filteredOutArray.length > 0) {
                                var filteredList = [];
                                for (var k = 0; k < filteredOutArray.length; k++) {
                                    filteredList.push(filteredOutArray[k].text + ' (' + filteredOutArray[k].searchVolume + ')');
                                }
                                finalColumnDValue = filteredList.join('\n');
                            }

                        } else {
                            finalColumnCValue = suggestedKeywords;
                            var uncoveredList = [];
                            for (var k = 0; k < data.uncovered.length; k++) {
                                uncoveredList.push(data.uncovered[k].text + ' (' + data.uncovered[k].searchVolume + ')');
                            }
                            finalColumnDValue = uncoveredList.join('\n');
                        }
                    }

                    sheet.getRange(currentRow, 3).setValue(finalColumnCValue);
                    sheet.getRange(currentRow, 4).setValue(finalColumnDValue);

                } else {
                    Utils.log('API 請求失敗，網址: ' + trimmedUrl);
                    sheet.getRange(currentRow, 2, 1, 3).setValue('API 錯誤');
                }

            } catch (e) {
                Utils.log('處理網址時發生錯誤: ' + trimmedUrl + ', 錯誤訊息: ' + e.message);
                sheet.getRange(currentRow, 2, 1, 3).setValue('處理錯誤');
            }
        }

        SheetHelper.showToast('關鍵字數據處理完成', '關鍵字研究', 5);
    }

    /**
     * 調用 OpenAI API 獲取關鍵字建議
     */
    function getOpenAISuggestions(coveredKeywordsArray, uncoveredKeywordsArray) {
        if (!OPENAI_API_KEY) {
            Utils.log('OpenAI API 金鑰未設定');
            return '請先設定 API Key';
        }

        var coveredList = [];
        for (var i = 0; i < coveredKeywordsArray.length; i++) {
            var item = coveredKeywordsArray[i];
            if (item.gsc) {
                var avgPosition = item.gsc.avgPosition ? item.gsc.avgPosition.toFixed(1) : 'N/A';
                coveredList.push(item.text + ' (排名: ' + avgPosition + ', 點擊: ' + item.gsc.clicks + ', 曝光: ' + item.gsc.impressions + ')');
            } else {
                coveredList.push(item.text + ' (搜尋量: ' + item.searchVolume + ')');
            }
        }
        var coveredText = coveredList.join('\n');

        var uncoveredList = [];
        for (var i = 0; i < uncoveredKeywordsArray.length; i++) {
            uncoveredList.push(uncoveredKeywordsArray[i].text + ' (搜尋量: ' + uncoveredKeywordsArray[i].searchVolume + ')');
        }
        var uncoveredText = uncoveredList.join('\n');

        var prompt = '你是一位頂尖的 SEO 內容策略師。請分析已覆蓋關鍵字的成效，從未覆蓋關鍵字中挑選最有潛力的詞。\n\n' +
            '已覆蓋關鍵字:\n' + coveredText + '\n\n' +
            '未覆蓋關鍵字:\n' + uncoveredText + '\n\n' +
            '請直接列出建議的關鍵字（僅關鍵字本身），每個一行。如果無建議則回傳「無建議」。';

        var apiEndpoint = 'https://api.openai.com/v1/chat/completions';
        var payload = {
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 300
        };

        var options = {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        try {
            var response = UrlFetchApp.fetch(apiEndpoint, options);
            var responseCode = response.getResponseCode();
            var responseBody = response.getContentText();

            if (responseCode === 200) {
                var parsedResponse = JSON.parse(responseBody);
                if (parsedResponse.choices && parsedResponse.choices.length > 0) {
                    return parsedResponse.choices[0].message.content.trim();
                }
                return 'OpenAI 回應格式錯誤';
            } else {
                Utils.log('OpenAI API 錯誤: ' + responseCode + ' - ' + responseBody);
                return 'OpenAI API 錯誤 (' + responseCode + ')';
            }
        } catch (e) {
            Utils.log('OpenAI 調用失敗: ' + e.message);
            return 'OpenAI 調用錯誤';
        }
    }

    return {
        fetchKeywordData: fetchKeywordData
    };
})();

// ============================================================
// UrlKeywordFinder - URL 關鍵字洞察查找
// ============================================================
var UrlKeywordFinder = (function () {
    'use strict';

    var SOURCE_COLUMN = 1;  // A 欄
    var TARGET_COLUMN = 4;  // D 欄

    /**
     * 處理 URLs 並填充關鍵字洞察
     */
    function processUrlsAndFillKeywords() {
        var sheet = SheetHelper.getActiveSheet();
        var startRow = 2;
        var lastRow = sheet.getLastRow();

        if (lastRow < startRow) {
            SheetHelper.showAlert('工作表中沒有需要處理的資料');
            return;
        }

        var firstCol = Math.min(SOURCE_COLUMN, TARGET_COLUMN);
        var lastCol = Math.max(SOURCE_COLUMN, TARGET_COLUMN);
        var numCols = lastCol - firstCol + 1;

        var range = sheet.getRange(startRow, firstCol, lastRow - startRow + 1, numCols);
        var values = range.getValues();

        var sourceIndex = SOURCE_COLUMN - firstCol;
        var targetIndex = TARGET_COLUMN - firstCol;

        for (var i = 0; i < values.length; i++) {
            var url = values[i][sourceIndex];
            var resultCell = values[i][targetIndex];
            var currentRow = startRow + i;

            if (url && typeof url === 'string' && url.trim() !== '' && !resultCell) {
                try {
                    var payload = {
                        url: url,
                        region: 'HK',
                        language: 'zh-TW'
                    };

                    Utils.log('正在處理第 ' + currentRow + ' 列的 URL: ' + url);

                    var response = ApiClient.post(Config.API_ENDPOINTS.KEYWORD_INSIGHTS_API, payload);
                    var json = response.json();

                    var output;
                    if (json && json.success && json.data && json.data.formatted) {
                        output = json.data.formatted;
                        Utils.log('成功取得資料: ' + output);
                    } else {
                        output = 'API 錯誤: ' + (json && json.message ? json.message : '未知錯誤');
                        Utils.log(output);
                    }

                    sheet.getRange(currentRow, TARGET_COLUMN).setValue(output);

                } catch (e) {
                    var errorMessage = '腳本錯誤: ' + e.message;
                    Utils.log(errorMessage);
                    sheet.getRange(currentRow, TARGET_COLUMN).setValue(errorMessage);
                }

                SpreadsheetApp.flush();
            }
        }

        SheetHelper.showToast('處理完成！', 'URL 關鍵字查找', 5);
    }

    return {
        processUrlsAndFillKeywords: processUrlsAndFillKeywords
    };
})();

// ============================================================
// 向後兼容的全局函數（供菜單調用）
// ============================================================
function fetchKeywordData() {
    return AdwordsResearch.fetchKeywordData();
}

function runProcessor() {
    return UrlKeywordFinder.processUrlsAndFillKeywords();
}

// ============================================================
// 模組載入完成
// ============================================================
Utils.log('3_KeywordResearch.js 已載入 - 關鍵字研究功能可用');
