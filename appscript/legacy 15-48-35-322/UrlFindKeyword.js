/**
 * @OnlyCurrentDoc
 *
 * 這個腳本旨在讀取 Google Sheet 中指定欄位的 URL，
 * 透過 API 取得關鍵字數據，然後將結果填入另一個指定欄位。
 *
 * 為了避免與您項目中可能存在的其他腳本發生衝突，
 * 所有的核心邏輯都被封裝在一個名為 KEYWORD_INSIGHTS_SCRIPT 的物件中。
 */

// -------------------腳本設定-------------------

// 建立一個獨立的命名空間(物件)，以避免與其他腳本發生衝突
const KEYWORD_INSIGHTS_SCRIPT = {

    // --- 您可以在這裡修改主要設定 ---

    /**
     * API 端點的 URL。
     * **！！！極度重要！！！**
     * 您必須將您的後端服務部署到一個公開的網路伺服器上，
     * 然後將此 URL 替換成您部署後的公開 URL。
     */
    API_ENDPOINT: 'https://keyword-lens.vercel.app/api/url/keyword-insights',

    /**
     * 要處理的工作表名稱。如果留空，則會自動使用當前活動的工作表。
     */
    SHEET_NAME: '', // 留空以使用當前活動工作表

    /**
     * 【可設定】要讀取 URL 的來源欄位。
     * 請使用數字代表：A=1, B=2, C=3, ... , M=13, N=14, O=15 等。
     */
    SOURCE_COLUMN: 1, // <-- 目前設定為 M 欄

    /**
     * 【可設定】要寫入 API 結果的目標欄位。
     * 請使用數字代表：A=1, B=2, C=3, ... , M=13, N=14, O=15 等。
     */
    TARGET_COLUMN: 4, // <-- 目前設定為 N 欄


    // --- 核心處理邏輯 (通常不需要修改以下內容) ---

    /**
     * 主要的處理函式。
     */
    processUrlsAndFillKeywords: function () {
        const ui = SpreadsheetApp.getUi();
        let sheet;

        // 取得要處理的工作表
        if (this.SHEET_NAME) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.SHEET_NAME);
            if (!sheet) {
                ui.alert(`錯誤：找不到名為 "${this.SHEET_NAME}" 的工作表。`);
                return;
            }
        } else {
            sheet = SpreadsheetApp.getActiveSheet();
        }

        const startRow = 2; // 從第二列開始處理 (假設第一列是標頭)
        const lastRow = sheet.getLastRow();
        if (lastRow < startRow) {
            ui.alert('工作表中沒有需要處理的資料。');
            return;
        }

        // 根據設定的欄位，一次性取得所有資料以提高效率
        const sourceCol = this.SOURCE_COLUMN;
        const targetCol = this.TARGET_COLUMN;
        // 計算需要讀取的範圍，從來源欄開始，到目標欄結束
        const firstCol = Math.min(sourceCol, targetCol);
        const lastCol = Math.max(sourceCol, targetCol);
        const numCols = lastCol - firstCol + 1;

        const range = sheet.getRange(startRow, firstCol, lastRow - startRow + 1, numCols);
        const values = range.getValues();

        // 計算來源欄和目標欄在讀取進來的二維陣列中的索引 (index)
        const sourceIndex = sourceCol - firstCol;
        const targetIndex = targetCol - firstCol;

        // 逐列處理
        for (let i = 0; i < values.length; i++) {
            const url = values[i][sourceIndex];       // 從來源欄索引取得 URL
            const resultCell = values[i][targetIndex]; // 從目標欄索引檢查是否已有內容
            const currentRow = startRow + i;

            // 如果來源欄有 URL 且目標欄是空的，才進行處理
            if (url && typeof url === 'string' && url.trim() !== '' && !resultCell) {
                try {
                    const payload = { url: url, region: "HK", language: "zh-TW" };
                    const options = {
                        'method': 'post',
                        'contentType': 'application/json',
                        'payload': JSON.stringify(payload),
                        'muteHttpExceptions': true
                    };

                    Logger.log(`正在處理第 ${currentRow} 列的 URL: ${url}`);
                    const response = UrlFetchApp.fetch(this.API_ENDPOINT, options);
                    const responseCode = response.getResponseCode();
                    const responseBody = response.getContentText();

                    let output;

                    if (responseCode === 200) {
                        const jsonResponse = JSON.parse(responseBody);
                        if (jsonResponse.success && jsonResponse.data && jsonResponse.data.formatted) {
                            output = jsonResponse.data.formatted;
                            Logger.log(`成功取得資料: ${output}`);
                        } else {
                            output = `API 錯誤: ${jsonResponse.message || responseBody}`;
                            Logger.log(output);
                        }
                    } else {
                        output = `HTTP 錯誤，狀態碼: ${responseCode}. 回應: ${responseBody}`;
                        Logger.log(output);
                    }

                    // 將結果寫入設定的目標欄位
                    sheet.getRange(currentRow, this.TARGET_COLUMN).setValue(output);

                } catch (e) {
                    const errorMessage = `腳本錯誤: ${e.message}`;
                    Logger.log(errorMessage);
                    sheet.getRange(currentRow, this.TARGET_COLUMN).setValue(errorMessage);
                }

                SpreadsheetApp.flush(); // 強制寫回，確保進度
            }
        }

        ui.alert('處理完成！');
    }
};

// -------------------Google Sheets UI 整合-------------------

/**
 * 當文件被開啟時，自動在 UI 上建立一個自訂選單。
 */
// function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('⚙️ 關鍵字推薦腳本')
//     .addItem('🚀 開始處理', 'runProcessor') // 選單文字可以自訂
//     .addToUi();
// }

/**
 * 這是選單按鈕會呼叫的全局函式。
 */
function runProcessor() {
    KEYWORD_INSIGHTS_SCRIPT.processUrlsAndFillKeywords();
}