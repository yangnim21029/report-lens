/**
 * @OnlyCurrentDoc
 */

/**
 * 主功能：處理整個工作表，擷取作者和日期。
 * - 表頭從第 2 列讀取。
 * - 每處理 10 列資料，會強制將變更寫入工作表。
 * - 只能從 Apps Script 編輯器手動執行。
 */
function processSheet() {
    console.log("================ 腳本開始執行 ================");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    console.log(`目標工作表: "${sheet.getName()}"`);

    const range = sheet.getDataRange();
    const values = range.getValues();

    const headerRow = 2;
    const dataStartRow = 3;

    const headers = values[headerRow - 1].map(h => String(h).trim().toLowerCase());
    console.log(`從第 ${headerRow} 列讀取到的表頭: [${headers.join(", ")}]`);

    const urlColIdx = headers.indexOf('url') + 1;
    const authorColIdx = headers.indexOf('authorname') + 1;
    const dateColIdx = headers.indexOf('publisheddate') + 1;
    console.log(`欄位索引 -> Url: ${urlColIdx}, AuthorName: ${authorColIdx}, PublishedDate: ${dateColIdx}`);

    if (urlColIdx === 0 || authorColIdx === 0 || dateColIdx === 0) {
        console.error(`錯誤：在您的「第 ${headerRow} 列」找不到必要的欄位名稱 (Url, AuthorName, PublishedDate)。腳本已終止。`);
        return;
    }

    // --- 新增：用於計算處理列數的計數器 ---
    let processedRowCount = 0;

    // 從第三列開始遍歷資料 (索引值為 2)
    for (let i = dataStartRow - 1; i < values.length; i++) {
        const currentRowInSheet = i + 1;
        console.log(`--- 正在處理工作表第 ${currentRowInSheet} 列 ---`);

        const url = values[i][urlColIdx - 1];
        const author = values[i][authorColIdx - 1];
        const date = values[i][dateColIdx - 1];

        if (url && typeof url === 'string' && url.startsWith('http') && (!author || !date)) {
            console.log(`找到有效URL，準備擷取: ${url}`);
            try {
                const result = scrapeUrl(url);
                console.log(`擷取結果 -> 作者: '${result.author}', 日期: '${result.publishedDate}'`);

                if (result.author) {
                    sheet.getRange(currentRowInSheet, authorColIdx).setValue(result.author);
                }
                if (result.publishedDate) {
                    sheet.getRange(currentRowInSheet, dateColIdx).setValue(result.publishedDate);
                }
            } catch (e) {
                sheet.getRange(currentRowInSheet, authorColIdx).setValue(`擷取失敗`);
                console.error(`擷取失敗 URL: ${url}, 錯誤: ${e.message}`);
            }
            Utilities.sleep(500);
        } else {
            if (!url || typeof url !== 'string' || !url.startsWith('http')) {
                console.log(`跳過此列：URL "${url}" 無效或為空。`);
            } else {
                console.log(`跳過此列：Author 或 PublishedDate 欄位已填寫。`);
            }
        }

        // --- 新增：每處理 10 列就 flush 一次 ---
        processedRowCount++;
        if (processedRowCount % 10 === 0) {
            SpreadsheetApp.flush();
            console.log(`--- 已處理 ${processedRowCount} 列，正在將變更寫入工作表 ---`);
        }
        // --- END ---
    }

    // 迴圈結束後，確保最後一批資料也被寫入
    SpreadsheetApp.flush();
    console.log("================ 腳本執行完畢 ================");
}

/**
 * 輔助函式：從單一 URL 擷取內容並解析 (此函式不需修改)
 */
function scrapeUrl(url) {
    // ... (此函式內容與前一版相同)
    console.log(`[scrapeUrl] 正在擷取: ${url}`);
    const options = {
        'muteHttpExceptions': true,
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
        }
    };
    const response = UrlFetchApp.fetch(url, options);
    const content = response.getContentText();
    let author = '';
    let publishedDate = '';
    const dateBlockMatch = content.match(/<div class="pl-author-panel__date"[^>]*>([\s\S]*?)<\/div>/i);
    if (dateBlockMatch && dateBlockMatch[1]) {
        console.log('[scrapeUrl] 成功匹配到資料區塊。');
        const dateBlockHtml = dateBlockMatch[1];
        const authorMatch = dateBlockHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        if (authorMatch && authorMatch[1]) {
            author = authorMatch[1].trim();
        }
        const plainText = dateBlockHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const dateMatch = plainText.match(/\s+on\s+(.*)/i);
        if (dateMatch && dateMatch[1]) {
            publishedDate = dateMatch[1].trim();
        }
    } else {
        console.log('[scrapeUrl] 警告：在頁面源碼中找不到指定的資料區塊 (div class="pl-author-panel__date")。');
    }
    console.log(`[scrapeUrl] 返回結果 -> 作者: '${author}', 日期: '${publishedDate}'`);
    return { author, publishedDate };
}