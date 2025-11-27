/**
 * ===============================================================
 * 主控函式：自動化處理多個指定的工作表
 * ===============================================================
 * 說明：
 * 1. 在下方的 TABS_TO_PROCESS 陣列中填入您想要處理的工作表名稱。
 * 2. 執行此函式 (runAnalysisOnMultipleTabs)。
 * 3. 腳本會自動依序切換到每個工作表。
 * 4. 對於每個工作表，它會先執行初始化 (PageLens_InitializeColumns)，
 * 這會處理所有 'HtmlTagSuggestion' 欄位為空的的資料列。
 * 5. 接著，它會再執行一次標準分析 (PageLens_RunAnalyzeWpArticle)，
 * 這會重新檢查先前未通過 (non-pass) 的資料列。
 */
function runAnalysisOnMultipleTabs() {
    // ▼▼▼ 請在這裡修改成您要執行的工作表名稱 ▼▼▼
    const TABS_TO_PROCESS = ['10月Repost任務執行_DE', '10月Repost任務執行_SEOTEAM'];
    // ▲▲▲ 請將 '工作表1', '工作表2' 等換成您實際的 Tab 名稱 ▲▲▲

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    Logger.log(`--- 開始執行多工作表分析 ---`);
    Logger.log(`預計處理的工作表: ${TABS_TO_PROCESS.join(', ')}`);

    // 遍歷所有指定的工作表
    for (const sheetName of TABS_TO_PROCESS) {
        const sheet = spreadsheet.getSheetByName(sheetName);

        if (!sheet) {
            Logger.log(`[警告] 找不到名為 "${sheetName}" 的工作表，已跳過。`);
            continue; // 如果找不到該工作表，就跳到下一個
        }

        // 啟用該工作表，這很重要，因為您原本的程式碼依賴 getActiveSheet()
        sheet.activate();
        SpreadsheetApp.flush(); // 強制應用變更

        Logger.log(`\n===== 正在處理工作表: "${sheetName}" =====`);

        try {
            // 步驟 1: 執行初始化 (自動初始化)
            // 這個函式會找到 'HtmlTagSuggestion' 欄位為空的資料列並進行首次分析。
            Logger.log(`[${sheetName}] -> 開始執行初始化...`);
            const initResult = PageLensHtmlTagAudit.initializeAnalysisColumns();
            Logger.log(`[${sheetName}] -> 初始化完成。結果: ${initResult}`);

            // 步驟 2: 執行標準分析
            // 這個函式會處理 'HtmlTagPassTime' 欄位不等於 'pass' 的資料列，
            // 適合用來更新之前分析失敗的項目。
            Logger.log(`[${sheetName}] -> 開始執行標準分析 (更新未通過項目)...`);
            const analyzeResult = PageLensHtmlTagAudit.analyzeWpArticle();
            Logger.log(`[${sheetName}] -> 標準分析完成。結果: ${analyzeResult}`);

        } catch (e) {
            Logger.log(`[錯誤] 在處理 "${sheetName}" 工作表時發生錯誤: ${e.message}`);
            // 即使某個工作表出錯，也繼續處理下一個
        }
    }

    Logger.log(`\n--- 所有指定的工作表均已處理完畢 ---`);
    SpreadsheetApp.getUi().alert('已完成所有指定工作表的分析！');
}