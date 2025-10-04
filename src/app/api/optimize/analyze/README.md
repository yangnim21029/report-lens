# Analyze API 快速指南

這份筆記整理 `/api/optimize/analyze` POST API 的輸入、主要流程與輸出，方便快速了解這支服務。

## Endpoint
- Method: `POST`
- Path: `/api/optimize/analyze`
- Content-Type: `application/json`

## 請求內容 (Request Body)
| 欄位 | 型別 | 是否必填 | 說明與格式提示 |
| --- | --- | --- | --- |
| `page` | string | ✅ | 要分析的文章頁面完整 URL。缺少時直接回傳 400。|
| `bestQuery` | string | ⛔️ | 目前排名最佳的關鍵字 (Rank 1-3)。|
| `bestQueryClicks` | number | ⛔️ | `bestQuery` 近 14 天點擊數。|
| `bestQueryPosition` | number | ⛔️ | `bestQuery` 平均排名。|
| `prevBestQuery` | string | ⛔️ | 前一次最佳關鍵字，用於比較。|
| `prevBestClicks` | number | ⛔️ | `prevBestQuery` 點擊數。|
| `prevBestPosition` | number | ⛔️ | `prevBestQuery` 平均排名。|
| `rank1` ~ `rank3` | string | ⛔️ | 現在排名 1-3 的關鍵字描述，格式慣例為：`關鍵字 (rank: 1.2, clicks: 123, impressions: 456)`。|
| `rank4` ~ `rank10` | string | ⛔️ | 排名 4-10 的關鍵字。API 會把這些字串拆解成欄位，也會擷取 top 3 去做 Content Explorer 擴充。|
| `prevRank1` ~ `prevRank10`, `prevRankGt10` | string | ⛔️ | 前一次的排名快照。|

> ⛔️ = 選填；只要提供格式完整的字串即可，缺值會以 `"N/A"` 補上。

## 核心處理流程
1. **輸入驗證與抓頁面**：讀取 `page` URL，使用自訂 User-Agent 抓取 HTML，失敗回 502。抓到後嘗試抽出 `.pl-main-article` 區塊並轉成文字 (最多 6000 字元)。
2. **頁面資訊整理**：解析 `<title>`、`meta description`、`og:title`、`og:description`；並依 `holidaysmart.io` URL 中的地區碼判斷語系語氣設定 (`hk`/`tw`/`cn`/`sg`/`my`，缺省為 `hk`)，決定要使用的語言描述與語氣指引。
3. **關鍵字資料整理**：
   - 解析 Rank 1-3、Rank 4-10、Prev Rank 等字串，抽取 `rank`、`clicks`、`impressions`、`SV`。
   - 將 Rank 4-10 組成清單並計算 `keywordsAnalyzed` 的數量。
4. **Keyword Coverage 擴充 (非強制)**：呼叫 `fetchKeywordCoverage(page)` (外部服務 `keyword-lens.vercel.app`)，取得 Covered/Uncovered 関鍵字與 Search Volume；若成功，會把 SV 資料補寫回 Rank 字串並記錄零搜尋量詞。
5. **Content Explorer 擴充 (非強制)**：根據 Rank 4-10 的字串拆出 (keyword, impressions, position)，挑出曝光最高的前三個關鍵字，呼叫 `fetchContentExplorerForQueries()` 取得競品/流量指標，組成摘要表與重點敘述。
6. **建立分析 Prompt**：將文章文字、Meta、Locale 設定、Rank 資料、Coverage/Explorer 的段落等全部塞入長 Markdown Prompt。
7. **呼叫 OpenAI**：使用 `gpt-5-mini-2025-08-07` 模型產生語義劫持建議。若失敗，錯誤會被捕捉並走到 500。
8. **回傳 JSON**：把 LLM 回傳的 Markdown、拆解後的區塊，以及前面整理好的結構化資料一起回傳。

## 回應格式 (成功案例)
```json
{
  "success": true,
  "analysis": "...LLM 產生的 Markdown...",
  "sections": {
    "quickWins": "## Search Characteristic Analysis...",
    "paragraphAdditions": "## Core Hijacking Strategy...",
    "structuralChanges": "## Implementation Priority...",
    "rawAnalysis": "...全文..."
  },
  "keywordsAnalyzed": 7,
  "topRankKeywords": [{ "keyword": "...", "rank": 1.3, "clicks": 120, "impressions": 500, "searchVolume": 320, "raw": "..." }],
  "rankKeywords": [{ "keyword": "...", "rank": 4.8, "clicks": 30, "impressions": 300, "searchVolume": 450, "raw": "..." }],
  "previousRankKeywords": [{ "keyword": "...", "rank": 6.1, "clicks": 25, "impressions": 250, "searchVolume": null, "raw": "..." }],
  "zeroSearchVolumeKeywords": {
    "rank": [/* Rank 4-10 中 SV = 0 的項目 */],
    "coverage": [/* Coverage API 回傳 SV=0 的項目 */]
  },
  "contentExplorer": {
    "table": "...",
    "difficultyNotes": ["..."],
    "formatNotes": ["..."],
    "paaNotes": ["..."],
    "pickedQueries": ["keyword A", "keyword B"],
    "insights": [ { /* 原始分析資料 */ } ]
  },
  "keywordCoverage": {
    "covered": [ { "text": "...", "searchVolume": 320, "gsc": { "clicks": 10, "impressions": 200, "avgPosition": 5.2 } } ],
    "uncovered": [ { "text": "...", "searchVolume": 540 } ],
    "zeroSearchVolume": [ { "text": "...", "searchVolume": 0 } ],
    "searchVolumeMap": { "keyword": 540 }
  },
  "promptBlocks": {
    "keywordCoverage": "...Markdown 片段...",
    "contentExplorer": "...Markdown 片段..."
  }
}
```

## 失敗回應
- 400：`{ success: false, error: "Missing page" }` 當 `page` 欄位缺少或為空。
- 502：`{ success: false, error: "Fetch failed: <status>" }` 外部頁面抓取失敗。
- 500：`{ success: false, error: "<error message>" }` 其它未預期錯誤 (例如 OpenAI 或擴充服務失敗)。

## 其他備註
- 依賴的環境變數：`OPENAI_API_KEY` (來自 `~/env`)，若缺少會在呼叫 OpenAI 時噴錯。
- Prompt 內容會在伺服端 `console.log` (方便 debugging，但要注意敏感資訊)。
- 擴充服務 (`keyword-coverage`, `content explorer`) 若失敗，流程會忽略錯誤直接繼續，確保核心分析仍可完成。
- Content Explorer 會提供競品頁面的流量、DA、Backlinks、PAA 等整理，供後續人工判讀。
