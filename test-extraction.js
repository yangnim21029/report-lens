// 測試新格式的提取邏輯
const { extractAnalysisData } = require("./dist/utils/analysisExtractor.js");

const testAnalysis = `搜索特性分析
分析 動森島民排行 的決策摩擦  

範圍：中等 — 用戶主要要「誰排第一／各級別名單」，有時會想知道「來源、年份、名單完整度」。  

## 實施優先級

### 立即執行（必備改動）
- 加入 H2「動森島民一覽（2025 更新｜來源：gamepedia 投票）」並放置一個按等級列出的清單或可收合表格（SS → D，各列出角色名稱）。  
- 在文章開頭直接標示更新日期與排名來源／方法（例如：資料來自 gamepedia 的人氣投票，更新於 2025 年 X 月）。同時在 meta description / title 加上「動森島民」關鍵變體以覆蓋 rank5 流量。

### 可選優化（如果有餘力）
- 為熱門角色（如：小潤、傑克、茶茶丸、檸檬娜）加入錨點連結到文章內分級位置，滿足個別角色查詢的需求（小改動）。  
- 新增一段「為何這排行重要／如何解讀」的短說明，強化搜尋者對排名方法的理解（中度改動）。

## 📝 必備執行項目
1. **最關鍵改動**：新增「按等級整理的島民清單表格」並放在文章可見位置（H2 下）。理由：直接對應 Best Query 的核心需求，一目了然降低決策摩擦。  
2. **次關鍵改動**：標示「2025 更新 / 來源（gamepedia）」並在開頭與 meta/sns 標題補入「動森島民」字樣。理由：提高信任與覆蓋 Rank5 高流量變體。

實施方式：REPOST（在現有文章補充，不另起新篇）

### 策略判斷
建議：REPOST（在現有文章內補強）  
理由：必備要素都是「垂直/從屬」類，能以小幅補充（表格、更新標註、同義詞覆蓋）把現有文章變成 Best Query 的最佳答案；不需要另寫新文章。改動量屬於 10-20% 範圍，且不改變主題核心。`;

const pageData = {
	page: "https://holidaysmart.io/hk/article/196205/",
	best_query: "動森島民排行",
};

console.log("測試新格式提取...\n");
const result = extractAnalysisData(testAnalysis, pageData);

console.log("提取結果：");
console.log("策略：", result.strategy);
console.log("\n優先級 - 立即執行：");
result.priority.shortTerm.forEach((item, i) => {
	console.log(`  ${i + 1}. ${item}`);
});
console.log("\n優先級 - 可選優化：");
result.priority.semanticHijack.forEach((item, i) => {
	console.log(`  ${i + 1}. ${item}`);
});
console.log("\n執行清單：");
result.executionList.forEach((item, i) => {
	console.log(`  ${i + 1}. ${item}`);
});
