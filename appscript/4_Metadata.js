// ============================================================
// 4_Metadata.js - 元數據提取功能模組
// ============================================================
// 從網頁中提取作者和發佈日期元數據
// 依賴: 0_Common.js (Config, Utils, ApiClient, SheetHelper)
// ============================================================

// ============================================================
// MetadataExtractor - 元數據提取服務
// ============================================================
var MetadataExtractor = (function () {
    'use strict';

    var HEADER_ROW = 2;  // 表頭在第 2 列

    /**
     * 處理整個 Sheet，提取作者和日期
     */
    function processSheet() {
        Utils.log('================ 腳本開始執行 ================');

        var sheet = SheetHelper.getActiveSheet();
        Utils.log('目標工作表: "' + sheet.getName() + '"');

        var range = sheet.getDataRange();
        var values = range.getValues();

        var headers = values[HEADER_ROW - 1].map(function (h) {
            return String(h).trim().toLowerCase();
        });
        Utils.log('從第 ' + HEADER_ROW + ' 列讀取到的表頭: [' + headers.join(', ') + ']');

        var urlColIdx = headers.indexOf('url') + 1;
        var authorColIdx = headers.indexOf('authorname') + 1;
        var dateColIdx = headers.indexOf('publisheddate') + 1;

        Utils.log('欄位索引 -> Url: ' + urlColIdx + ', AuthorName: ' + authorColIdx + ', PublishedDate: ' + dateColIdx);

        if (urlColIdx === 0 || authorColIdx === 0 || dateColIdx === 0) {
            var error = '錯誤：在您的「第 ' + HEADER_ROW + ' 列」找不到必要的欄位名稱 (Url, AuthorName, PublishedDate)。腳本已終止。';
            Utils.log(error);
            SheetHelper.showAlert(error);
            return;
        }

        var processedRowCount = 0;

        // 從第三列開始遍歷資料
        for (var i = HEADER_ROW; i < values.length; i++) {
            var currentRowInSheet = i + 1;
            Utils.log('--- 正在處理工作表第 ' + currentRowInSheet + ' 列 ---');

            var url = values[i][urlColIdx - 1];
            var author = values[i][authorColIdx - 1];
            var date = values[i][dateColIdx - 1];

            if (url && typeof url === 'string' && url.indexOf('http') === 0 && (!author || !date)) {
                Utils.log('找到有效URL，準備擷取: ' + url);

                try {
                    var result = scrapeUrl(url);
                    Utils.log('擷取結果 -> 作者: \'' + result.author + '\', 日期: \'' + result.publishedDate + '\'');

                    if (result.author) {
                        sheet.getRange(currentRowInSheet, authorColIdx).setValue(result.author);
                    }
                    if (result.publishedDate) {
                        sheet.getRange(currentRowInSheet, dateColIdx).setValue(result.publishedDate);
                    }
                } catch (e) {
                    sheet.getRange(currentRowInSheet, authorColIdx).setValue('擷取失敗');
                    Utils.log('擷取失敗 URL: ' + url + ', 錯誤: ' + e.message);
                }

                Utils.sleep(500);
            } else {
                if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
                    Utils.log('跳過此列：URL "' + url + '" 無效或為空。');
                } else {
                    Utils.log('跳過此列：Author 或 PublishedDate 欄位已填寫。');
                }
            }

            // 每處理 10 列就 flush 一次
            processedRowCount++;
            if (processedRowCount % 10 === 0) {
                SpreadsheetApp.flush();
                Utils.log('--- 已處理 ' + processedRowCount + ' 列，正在將變更寫入工作表 ---');
            }
        }

        // 迴圈結束後，確保最後一批資料也被寫入
        SpreadsheetApp.flush();
        Utils.log('================ 腳本執行完畢 ================');

        SheetHelper.showToast('元數據提取完成！處理了 ' + processedRowCount + ' 列', '元數據提取', 5);
    }

    /**
     * 從單一 URL 擷取內容並解析
     */
    function scrapeUrl(url) {
        Utils.log('[scrapeUrl] 正在擷取: ' + url);

        var options = {
            'muteHttpExceptions': true,
            'headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
            }
        };

        var response = UrlFetchApp.fetch(url, options);
        var content = response.getContentText();

        var author = '';
        var publishedDate = '';

        // 嘗試匹配 date block
        var dateBlockMatch = content.match(/<div class="pl-author-panel__date"[^>]*>([\s\S]*?)<\/div>/i);

        if (dateBlockMatch && dateBlockMatch[1]) {
            Utils.log('[scrapeUrl] 成功匹配到資料區塊。');
            var dateBlockHtml = dateBlockMatch[1];

            // 提取作者
            var authorMatch = dateBlockHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
            if (authorMatch && authorMatch[1]) {
                author = authorMatch[1].trim();
            }

            // 提取日期
            var plainText = dateBlockHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            var dateMatch = plainText.match(/\s+on\s+(.*)/i);
            if (dateMatch && dateMatch[1]) {
                publishedDate = dateMatch[1].trim();
            }
        } else {
            Utils.log('[scrapeUrl] 警告：在頁面源碼中找不到指定的資料區塊 (div class="pl-author-panel__date")。');
        }

        Utils.log('[scrapeUrl] 返回結果 -> 作者: \'' + author + '\', 日期: \'' + publishedDate + '\'');

        return {
            author: author,
            publishedDate: publishedDate
        };
    }

    return {
        processSheet: processSheet,
        scrapeUrl: scrapeUrl
    };
})();

// ============================================================
// 向後兼容的全局函數（供菜單調用）
// ============================================================
function processSheet() {
    return MetadataExtractor.processSheet();
}

// ============================================================
// 模組載入完成
// ============================================================
Utils.log('4_Metadata.js 已載入 - 元數據提取功能可用');
