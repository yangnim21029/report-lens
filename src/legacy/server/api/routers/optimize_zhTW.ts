import { convert } from "html-to-text";
import { OpenAI } from "openai";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const optimizeRouter = createTRPCRouter({
	analyzeContent: publicProcedure
		.input(
			z.object({
				page: z.string(),
				bestQuery: z.string().nullable(),
				bestQueryClicks: z.number().nullable(),
				bestQueryPosition: z.number().nullable(),
				// 前期數據
				prevBestQuery: z.string().nullable(),
				prevBestPosition: z.number().nullable(),
				prevBestClicks: z.number().nullable(),
				// 排名關鍵詞
				rank4: z.string().nullable(),
				rank5: z.string().nullable(),
				rank6: z.string().nullable(),
				rank7: z.string().nullable(),
				rank8: z.string().nullable(),
				rank9: z.string().nullable(),
				rank10: z.string().nullable(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				// Step 1: Fetch article content
				const contentResponse = await fetch(input.page, {
					headers: {
						"User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)",
					},
				});

				if (!contentResponse.ok) {
					throw new Error(`Failed to fetch content: ${contentResponse.status}`);
				}

				const html = await contentResponse.text();

				// Extract region from URL for language localization
				const region = input.page.includes("holidaysmart.io")
					? input.page.match(/\/(hk|tw|sg)\//)?.[1] || "hk"
					: "hk";

				// Define language and locale settings
				const localeSettings = {
					hk: {
						language: "繁體中文（香港）",
						style: "港式用詞",
						examples: "係、嚟、唔、咁、啱、舖頭",
						tone: "親切、地道、生活化",
					},
					tw: {
						language: "繁體中文（台灣）",
						style: "台式用詞",
						examples: "的、來、不、這樣、對、店家",
						tone: "溫馨、在地、貼心",
					},
					cn: {
						language: "簡體中文（中國大陸）",
						style: "大陸用詞",
						examples: "的、来、不、这样、对、商家",
						tone: "專業、直接、實用",
					},
					sg: {
						language: "繁體中文（新加坡）",
						style: "星式用詞",
						examples: "的、來、不、這樣、對、店舖",
						tone: "多元、現代、簡潔",
					},
					default: {
						language: "繁體中文",
						style: "標準用詞",
						examples: "的、來、不、這樣、對、店舖",
						tone: "中性、標準、清晰",
					},
				};

				const currentLocale =
					localeSettings[region as keyof typeof localeSettings] ||
					localeSettings.default;

				// Extract meta information
				const titleMatch = html.match(/<title>(.*?)<\/title>/i);
				const metaDescMatch = html.match(
					/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i,
				);
				const ogTitleMatch = html.match(
					/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i,
				);
				const ogDescMatch = html.match(
					/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i,
				);

				const pageTitle = titleMatch ? titleMatch[1] : "";
				const metaDescription = metaDescMatch ? metaDescMatch[1] : "";
				const ogTitle = ogTitleMatch ? ogTitleMatch[1] : "";
				const ogDescription = ogDescMatch ? ogDescMatch[1] : "";

				// Helper function to extract image positions
				const extractImagePositions = (html: string) => {
					const imgRegex = /<img[^>]*>/gi;
					const images = [];
					let match;
					let count = 0;

					// Calculate text position before each image (extract up to 10 images)
					while ((match = imgRegex.exec(html)) && count < 10) {
						// Extract alt text
						const altMatch = match[0].match(/alt=["']([^"']*?)["']/i);
						const altText = altMatch ? altMatch[1] : "";

						// Get text before image to calculate position
						const beforeImg = html
							.substring(0, match.index)
							.replace(/<[^>]*>/g, "");
						const cleanText = beforeImg.replace(/\s+/g, " ").trim();

						// Calculate character position
						const position = cleanText.length;

						images.push(`[圖${count + 1}:"${altText}", 位置:${position}字]`);
						count++;
					}

					return images.length > 0 ? "\n\n圖片資訊：" + images.join(", ") : "";
				};

				// Extract main article content using specific selector
				const articleMatch = html.match(
					/<article[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
				);

				let textContent = "";
				let imageInfo = "";

				if (articleMatch && articleMatch[1]) {
					// Found main article content, extract from it
					textContent = convert(articleMatch[1], {
						wordwrap: false,
						selectors: [
							{ selector: "a", options: { ignoreHref: true } },
							{ selector: "img", format: "skip" },
						],
					});

					// Extract image positions
					imageInfo = extractImagePositions(articleMatch[1]);
				} else {
					// Fallback: try to find content in pl-main-article class
					const mainContentMatch = html.match(
						/<div[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
					);
					if (mainContentMatch && mainContentMatch[1]) {
						textContent = convert(mainContentMatch[1], {
							wordwrap: false,
							selectors: [
								{ selector: "a", options: { ignoreHref: true } },
								{ selector: "img", format: "skip" },
							],
						});

						// Extract image positions
						imageInfo = extractImagePositions(mainContentMatch[1]);
					} else {
						// Last resort: extract title and basic content
						const titleMatch = html.match(/<title>(.*?)<\/title>/i);
						const title = titleMatch ? titleMatch[1] : "";
						textContent =
							title +
							" " +
							convert(html, {
								wordwrap: false,
								selectors: [
									{ selector: "a", options: { ignoreHref: true } },
									{ selector: "img", format: "skip" },
								],
							}).substring(0, 4000);

						// Extract image positions from full HTML as last resort
						imageInfo = extractImagePositions(html);
					}
				}

				// Clean up ads, navigation and unwanted content
				textContent = textContent
					.replace(/data-key="[^"]*"/g, "")
					.replace(/ad-id-[a-z0-9]+/g, "")
					.replace(/data-v-[a-f0-9]+/g, "")
					.replace(/loading\.png/g, "")
					.replace(/presslogic-hk-hd\/static\/images/g, "")
					.replace(/\/hk\/category\/[a-zA-Z-]+/g, "")
					.replace(/\/hk\/author\/[a-zA-Z-]+/g, "")
					.replace(/By [A-Za-z\s]+ on \d+ [A-Za-z]+ \d+/g, "")
					.replace(/Digital Editor/g, "")
					.replace(/香港好去處|生活熱話|購物著數|美食推介|旅遊攻略/g, "")
					.replace(/\s+/g, " ")
					.trim()
					.substring(0, 8000); // Limit content length for API

				// Append image info to the content
				textContent += imageInfo;

				// Step 2: Collect and format keywords with rank and click information
				const keywordsList: string[] = [];
				const allKeywords: string[] = [];
				const attributeWords = new Set<string>();
				const seenNormalizedKeywords = new Set<string>();

				// Helper function to remove spaces from string (for duplicate detection)
				const removeSpaces = (str: string) => str.replace(/\s+/g, "");

				// Normalize Best Query for comparison and attribute extraction
				const bestQueryNormalized = removeSpaces(input.bestQuery || "");
				const bestQueryOriginal = input.bestQuery || "";

				// For attribute extraction, normalize the best query first
				const bestQueryForAttributes = bestQueryOriginal.replace(/\s+/g, "");
				const bestQueryChars = bestQueryForAttributes.split("");

				// Process each rank group and format with rank information
				const processRankKeywords = (rankData: string | null, rank: number) => {
					if (!rankData) return;
					const keywords = rankData.split(",").map((k) => k.trim());
					keywords.forEach((keyword) => {
						if (keyword) {
							// Extract keyword and clicks from format: "keyword(clicks)"
							const match = keyword.match(/^(.+?)\((\d+)\)$/);
							let kw = keyword;
							let clicks = "";

							if (match) {
								kw = match[1] ?? "";
								clicks = match[2] ?? "";
							}

							// Check if keyword is duplicate (after removing spaces)
							const kwNormalized = removeSpaces(kw);

							// Skip if duplicate of best query
							if (kwNormalized === bestQueryNormalized) {
								return;
							}

							// Skip if we've already seen this normalized form
							if (seenNormalizedKeywords.has(kwNormalized)) {
								return;
							}
							seenNormalizedKeywords.add(kwNormalized);

							// Extract attribute words (characters not in best query)
							if (input.bestQuery) {
								// Normalize keyword for attribute extraction (remove spaces)
								const kwNormalizedForAttr = kw.replace(/\s+/g, "");
								let remainingChars = kwNormalizedForAttr;

								// Remove each character of best query from the normalized keyword
								bestQueryChars.forEach((char) => {
									remainingChars = remainingChars.replace(char, "");
								});

								// Collect remaining characters as attributes
								if (remainingChars.length > 1) {
									// Keep as one attribute word if meaningful
									attributeWords.add(remainingChars);
								}
							}

							// Add to lists
							if (clicks) {
								keywordsList.push(`- ${kw} (rank: ${rank}, clicks: ${clicks})`);
								allKeywords.push(`${kw}(${clicks})`);
							} else {
								keywordsList.push(`- ${kw} (rank: ${rank})`);
								allKeywords.push(kw);
							}
						}
					});
				};

				processRankKeywords(input.rank4, 4);
				processRankKeywords(input.rank5, 5);
				processRankKeywords(input.rank6, 6);
				processRankKeywords(input.rank7, 7);
				processRankKeywords(input.rank8, 8);
				processRankKeywords(input.rank9, 9);
				processRankKeywords(input.rank10, 10);

				// Create a map to track normalized keywords and their original forms
				const normalizedKeywordMap = new Map<string, string>();
				allKeywords.forEach((kw) => {
					const normalized = kw.replace(/\s+/g, "");
					// Keep the first occurrence of each normalized form
					if (!normalizedKeywordMap.has(normalized)) {
						normalizedKeywordMap.set(normalized, kw);
					}
				});

				// Get unique keywords based on normalized form
				const uniqueKeywords = Array.from(normalizedKeywordMap.values()).filter(
					Boolean,
				);
				const attributesList = Array.from(attributeWords);

				// Step 3: Create structured prompt with proper AI mindset
				const prompt = `
# Role and Objective

評估 SEO 語意劫持潛力，利用 Rank 4-10 關鍵字數據，制定語意等價策略參考最佳表現查詢
你是 SEO 語義劫持專家，不是關鍵詞填充機器
🎯 核心目標：識別有顯著性的低摩擦詞，建立與 Best Query 的語義等價

⚠️ **關鍵思維轉變**：
- 你要找的不是「所有機會」，而是「缺了就無法成功劫持的必備要素」
- 想像你只能改 10-20% 的內容，這些改動必須是決定性的
- 不是撒網，是精準狙擊
- **劫持 = 讓 A 成為 B 的最佳答案，不是讓 A 和 B 放在一起**

# Instructions

開始時列出 3-7 項簡要概念性檢查清單，規劃你將採取的步驟
根據提供的數據，分辨出哪些關鍵字具備語意劫持機會
根據 Best Query、歷史 Best Query、是否有變化，以及關鍵字尾型（短尾/長尾），擬定語意等價策略
在資料缺失（如 Best Query =「未知」或「無數據」）時，請以 'N/A' 標示並繼續，不需報錯
請嚴格遵守指定輸出格式，所有標題需依正確 Markdown 階層（##、###）標示。這對後續自動處理至關重要
你要基於數據分析，不是憑空想像
必須使用指定的地區語言風格，標題建議要符合當地表達習慣

**必備要素識別三問**（每個建議都要通過這三關）：
1. 這個詞是否代表 Best Query 的「核心缺口」？
2. 補上這個詞，是否能立即降低用戶決策摩擦？
3. 不加這個詞，劫持是否會失敗？

三個都是「是」→ 必備要素 / 任何一個「否」→ 不列入建議

**🚨 語意等價驗證（新增）**：
問自己：用戶搜「Best Query」，給他「建議詞」的內容，他會滿意嗎？
- 會滿意 → 可能等價
- 不會滿意 → 只是相關，不能劫持

# Sub-categories

每個關鍵字需包含 keyword、rank、clicks、分類（具體/廣泛）、機會分析
語意等價策略需分析 best_query、prev_best_query、是否有變化，以及關鍵字尾型，給出具體策略建議
summary 請簡明陳述語意劫持機會及策略核心

## 詞彙類型定義與劫持價值評估：

### **垂直用詞**（同領域延伸）
- 定義：與原文主題直接相關的細化詞彙
- 例：船票文章的「船期」「船班」「購票方式」
- **劫持價值判斷**：
  - 單一垂直詞 = 小補充（通常不是必備）
  - 垂直詞群形成完整論述 = 可能是必備要素
  - 關鍵問：這些詞能否形成「決定性優勢」？
  
### **可詳述詞**（需展開說明）
- 定義：需要獨立篇幅詳細說明的概念詞
- 例：船票文章遇到「交通攻略」「旅遊指南」
- **劫持價值判斷**：
  - 如果是 Best Query 的「真實意圖」→ 必備要素
  - 如果只是相關但非核心 → 忽略
  - 關鍵問：用戶搜 Best Query 是否就是要找這個？
  
### **遠距離詞**（平行概念）
- 定義：與原文主題相距較遠的平行概念
- 例：船票文章遇到「住宿推薦」「美食攻略」
- **劫持價值判斷**：
  - 通常不是必備（除非數據顯示強關聯）
  - 關鍵問：這真的是同一批用戶要的嗎？

## 語意關係分類（新增 - 關鍵區別）

### **等價關係** ✅ 可以劫持
- A 可以代表 B 的核心意圖
- 用戶搜 B 看到 A 會覺得「對，這就是我要的」
- 例：
  - 「最強角色」等價「排名」（最強就是第一名）
  - 「船票」等價「交通」（當地主要交通就是船）
  - 「Tableau教學」等價「數據分析」（Tableau是主流工具）

### **從屬關係** ✅ 可以劫持
- A 是 B 的具體化版本
- 例：
  - 「角色強度排行」從屬於「排名」
  - 「梅州船票」從屬於「梅州交通」

### **相關關係** ❌ 不能劫持
- A 和 B 只是同主題的不同面向
- 用戶搜 B 看到 A 會覺得「這不是我要的」
- 例：
  - 「圖鑑」相關但不等價「排名」（資料庫 ≠ 評比）
  - 「個性查詢」相關但不等價「排名」（工具 ≠ 結果）
  - 「攻略」相關但不等價「排名」（方法 ≠ 評價）

### **無關關係** ❌ 絕對不能劫持
- 不同主題，用戶意圖完全不同

# Context
- 文章 URL：${input.page}
- 地區語言：${currentLocale.language} - ${currentLocale.style}
- 語言特色範例：${currentLocale.examples}
- 語調要求：${currentLocale.tone}
- 現有標題：${pageTitle}
- Meta 描述：${metaDescription}
- OG 標題：${ogTitle}
- Best Query（排名1-3）：「${input.bestQuery || "N/A"}」 - ${
					input.bestQueryClicks || 0
				} 次點擊 - 平均排名 ${input.bestQueryPosition || "N/A"}
- 前期 Best Query：${
					input.prevBestQuery
						? `「${input.prevBestQuery}」 - ${
								input.prevBestClicks || 0
							} 次點擊 - 平均排名 ${input.prevBestPosition || "N/A"}`
						: "N/A"
				}
- 是否有變化：${input.prevBestQuery && input.bestQuery !== input.prevBestQuery}
關鍵字列表（Rank 4-10）:
${keywordsList.join("\n")}
## 數據格式說明
- 每個關鍵字格式：keyword (rank: X, clicks: Y)
- rank：於 Google 的平均排名
- clicks：過去14天總點擊數
- 具體：低點擊詞多為具體、用戶需求但不熟悉之詞
- 廣泛：高點擊詞多為廣泛、用戶熟悉的常用詞
- Best Query 變化代表搶攻失敗/成功；需檢查新現況關鍵字規模（短尾/長尾）。
- 文章擷取片段：
${textContent.substring(0, 4000)}

 Reasoning Steps

## TO DO（執行步驟）

1. 分析 Best Query 的核心概念和用戶需求
2. **語意關係判斷**（新增關鍵步驟）：
   對每個 Rank 4-10 的詞進行關係分類：
   - 等價關係：可互相代表 → ✅ 可劫持
   - 從屬關係：A 是 B 的具體版本 → ✅ 可劫持
   - 相關關係：同主題不同面向 → ❌ 不能劫持
   - 無關關係：不同主題 → ❌ 絕對不能
   
   **情境測試**：
   用戶搜「[Best Query]」看到「[評估詞]」
   - 會點擊嗎？（吸引力）
   - 點進去會滿意嗎？（滿足度）
   - 覺得回答了問題嗎？（意圖匹配）
   
   三個都是「是」才能劫持

3. **缺口分析**：Best Query 用戶真正要什麼？現有文章缺什麼關鍵 piece？
4. **必備要素識別**：只從「等價」或「從屬」關係的詞中選擇

5. **顯著性測試**：這個詞能代表 Best Query 嗎？Google 會認為 [這個詞] ⊂ [Best Query] 嗎？
6. **組合效應評估**：不要單獨看詞，要看組合
   - 垂直詞A + 垂直詞B = 形成完整論述？
   - 可詳述詞 + 相關垂直詞 = 降低摩擦？
   - 找出「1+1>2」的組合

7. 判斷內容策略（基於必備要素特性）：

**REPOST 條件**：
- 必備要素都是垂直詞
- 不改變核心主題，只是補充關鍵缺口
- 加入後文章主題焦點不會偏移

**NEW POST 條件**：
- 必備要素包含可詳述詞或遠距離詞
- 需要改變文章重心才能涵蓋
- 加入後會讓原文失焦

7. 根據策略判斷，提供對應的具體執行清單

## 關鍵詞評估原則（強化版）

- **不是所有 Rank 4-10 的詞都有價值**
- **只有等價或從屬關係的詞才有劫持價值**
- 找出與 Best Query 所需資訊一致 + 低摩擦的詞 = 劫持機會
- **改動效益比評估**：
  - 改動量：需要加多少內容？
  - 效益：能帶來多少劫持機會？
  - 小改動 + 大效益 = 必備要素

# Planning and Validation

核心原則

決策摩擦：用戶從搜尋到行動的路徑難度
- 低摩擦：明確、直接行動（如Tableau教學、船票、戲院）
- 高摩擦：籠統模糊、需多步決策（如數據分析、交通、好去處）

資訊需求一致性：評估詞組及其最佳查詢的用戶需求是否一致
- 例：搜尋「梅州船期」和「梅州交通」同屬想辦法搭船
- 反例：搜尋「島民圖鑑」和「島民房屋」有不同需求

SEO 價值判斷：需同時滿足「需求一致」與「低摩擦」才有劫持機會

決策思維與判斷

策略評估思維：反映主題相關性及融合難度
劫持成功條件：
- 詞組準確反映 Best Query 的實際需求
- 摩擦度低於 Best Query（具體明確，便於採取行動）
- 現有切角可融合詞組屬性，且標題適合垂直合併

決策細則：
- REPOST：目標詞組是原主題的**子集或具體化**，可作為補充資訊存在
- NEW POST：目標詞組是**平行切角**，需要獨立完整的內容支撐
- 關鍵問題：這個策略是在**深化**原主題，還是**橫向擴展**到新主題？

重要評估原則

🚨 主題相關性判斷：
- **可融合（REPOST）**：
  * 新內容強化原文的核心論點
  * 補充具體例子、數據或操作細節
  * 例：《梅州船票攻略》加入「最新船期時刻表」→ 仍是船票文章
  
- **需獨立（NEW POST）**：
  * 新內容開啟不同的討論角度
  * 需要改變文章標題才能涵蓋
  * 例：《梅州船票攻略》要涵蓋「梅州巴士路線詳解」→ 需要新文章

- **快速判斷法**：
  如果要完整說明這個新策略，會不會讓原文章「失焦」？
  會失焦 → NEW POST / 不會失焦 → REPOST

所需改動：[描述改動類型：點綴補充/段落擴充/結構調整/主題轉移]
內容關係：[與原文主題的關係：深化延伸/平行擴展/獨立切角]

SEO 劫持原理

具體詞的顯著性 = 它能代表廣泛詞的程度
Google 認為「Tableau 數據分析教學」⊂「大數據分析」
搜「大數據分析」會匹配到「Tableau 教學」（因為 Tableau 有顯著性）
顯著性 + 低摩擦 = SEO 價值

劫持公式

具體方案 + 廣泛問題 = 降低決策摩擦
- 「Tableau 教學」+「數據分析」= 用戶直接學，不用選工具
- 「梅州船票」+「交通攻略」= 用戶直接買票，不用比較交通方式
- 「太古城戲院」+「室內好去處」= 用戶直接去，不用挑選

## 🚨 語意劫持可行性測試（新增）

### 劫持前必問：
1. **意圖測試**：
   - 搜「排名」的人要什麼？→ 誰強誰弱的評比
   - 給他「圖鑑」滿意嗎？→ 不會（只是資料）
   - 給他「最強推薦」滿意嗎？→ 會（這就是排名）

2. **等價測試**：
   - Google 會認為 [建議詞] ⊂ [Best Query] 嗎？
   - [建議詞] 能完全滿足 [Best Query] 的搜索意圖嗎？

3. **用戶滿意測試**：
   - 用戶會覺得找到答案了嗎？
   - 還是會覺得「這不是我要的」繼續找？

### 常見錯誤判斷：
❌ 把工具當結果：「查詢器」≠「查詢結果」
❌ 把資料當評價：「圖鑑」≠「排名」
❌ 把方法當答案：「攻略」≠「評測」
❌ 把相關當等價：同一遊戲的不同功能不能互換

## 🚨 必備要素篩選框架：

### 第一層篩選：缺口分析
- Best Query 的用戶真正要什麼？
- 現有文章缺什麼關鍵內容？
- Rank 4-10 哪個詞填補了這個缺口？

### 第二層篩選：顯著性測試
- 這個詞能代表 Best Query 嗎？
- 加了這個詞，文章會變成 Best Query 的最佳答案嗎？

### 第三層篩選：改動效益比
- 需要多大改動？
- 帶來多大效益？
- 值得嗎？

**記住：寧缺勿濫，找不到必備要素就誠實說「無明顯劫持機會」**

# RETURN FORMAT（完整輸出格式）

## 搜索特性分析
分析 ${input.bestQuery} 的決策摩擦
範圍、是否缺乏具體意圖、模糊程度、目前文章主用詞變化

## 語義劫持機會

### 詞彙類型分析（Rank 4-10）
| 詞彙類型 | 關鍵詞 | 與原文關係 | 整合難度 | 建議處理 |
|---------|--------|-----------|---------|----------|
| 垂直用詞 | [詞彙列表] | 直接相關 | 低 | REPOST |
| 可詳述詞 | [詞彙列表] | 需要展開 | 中-高 | NEW POST |
| 遠距離詞 | [詞彙列表] | 平行概念 | 高 | NEW POST |

### 語意關係判斷（新增）
| 關鍵詞 | 與 Best Query 關係 | 可否劫持 | 理由 |
|--------|-------------------|----------|------|
| [詞1] | 等價/從屬/相關/無關 | ✅/❌ | [具體說明] |
| [詞2] | 等價/從屬/相關/無關 | ✅/❌ | [具體說明] |

### 缺口分析
- Best Query 用戶核心需求：[具體描述]
- 現有文章缺失：[關鍵缺口]
- 哪些詞填補缺口：[列出詞彙]

## 核心劫持策略（只列必備要素）

### 必備要素一：[最關鍵的補充]
**語意關係**：[等價/從屬] - [具體說明為何可以代表 Best Query]
**用戶滿意度測試**：
- 搜 [Best Query] 看到這個會滿意嗎？[是/否及原因]
**為何必備**：[說明缺了這個為何劫持會失敗]
**詞彙組合**：[哪些詞一起發揮作用]
**目標詞彙類型**：[垂直/可詳述/遠距離]
**劫持組合**：「[具體詞]」等價「[Best Query]」
**改動規模**：[點綴補充/段落擴充/結構調整]
**預期效果**：[加了這個後的劫持效果]

### 必備要素二：[如果有第二個關鍵補充]
[同上格式，如果沒有就不要硬湊]

### 策略判斷
建議（REPOST / NEW POST）
理由：基於必備要素的特性[具體說明]

## 實施優先級

### 立即執行（必備改動）
[只列出真正必備的 1-3 項]

### 可選優化（如果有餘力）
[非必備但有幫助的項目]

## 📝 必備執行項目
1. **最關鍵改動**：[具體描述]
2. **次關鍵改動**：[如果有]
（最多 2 項，沒有就只列 1 項）

實施方式：[REPOST / NEW POST]

# Verbosity

## 輸出品質要求
精簡直接：核心洞見3-5句，條列描述
根據數據：引用真實關鍵詞，不預設臆測
執行步驟具體明確：每步清楚、完整（3-5點）
避免模糊結論（如「優化標題」、「調整結構」）

## ⚡ 語意劫持的核心邏輯（新增）

**永遠記住**：
- 劫持 = 讓 A 成為 B 的最佳答案
- 不是讓 A 和 B 放在一起
- 不是讓文章同時涵蓋 A 和 B
- 是讓搜 B 的人，看到 A 就滿意了

**判斷公式**：
- 相關 ≠ 等價
- 同主題 ≠ 可互換
- 可以放一起 ≠ 可以劫持


## ⚡ 必備要素識別原則（強化版）

- **不是機會清單**：不要列出所有可能性
- **是成敗關鍵**：只列出決定成敗的要素
- **精準打擊**：想像你只有一次機會改文章
- **測試思維**：如果不加這個，劫持會成功嗎？
  - 會 → 不是必備
  - 不會 → 必備要素
- **數量限制**：通常只有 1-2 個必備要素
- **誠實評估**：找不到必備要素 = 可能不需要優化

## ⚡ 避免過度優化陷阱

- 不要因為「可以加」就建議加
- 不要為了完整而建議一堆
- 記住：我們要的是 10-20% 的關鍵改動
- 不是 80% 的全面翻新
- **寧缺勿濫**：沒有明顯必備要素時，誠實說「目前無需優化」也是專業

# Stop Conditions

不要理會錯字變體（如：劉德華vs摟德华vs留的滑）- Google已能識別
不要憑空想像大詞（如：男星、香港）- 這些不在數據中，是優化後自然獲得的
不要機械地建議「加入這個關鍵詞」
不要單獨評估詞彙顯著性 - 要看與 Best Query 的需求一致性
不要把簡潔內容改成冗長（如：172cm → 據報導是172cm）
不要忽視搜索意圖（如：室內好去處 ≠ 我要去特定景點）
不要盲目建議「新增關鍵詞」- 除非是遺漏了可劫持的詞
不要堆砌詞彙 - 要思考如何降低用戶決策摩擦，控制概念定義權
不要建議刪減原有內容 - 需要刪減表示切角不同，應建議寫新文章
分析詞組之間的劫持關係，看具體詞能否代表廣泛詞
- 例：「劉德華身高」vs「郭富城身高」沒有劫持關係，是平行概念
不要亂改地區用詞 - 尊重關鍵詞本身的地區表達習慣
- 例：「海龜湯」vs「揭尾故」是不同地區的用詞，不要強行統一或修改
- 保持原有關鍵詞的地區特色和用語習慣
不要管 FAQ Schema (這不在這次分析範圍內)

**新增**：
- **不要混淆語意關係**：
  - 不要把「相關」當「等價」
    - 圖鑑 ≠ 排名（資料 ≠ 評價）
    - 查詢工具 ≠ 查詢結果
    - 攻略 ≠ 評測
    - 個性介紹 ≠ 強度評比
- 不要把「同一主題的不同面向」當成「可以互相代表」
- 不要把「可以放在同一篇文章」當成「可以劫持」
- 判斷標準：用戶搜 A 給他 B，他會覺得答對了嗎？
- 不要列出超過 2 個必備要素（通常只有 1 個）
- 不要把「nice to have」當成「must have」  
- 如果找不到必備要素 = 這篇文章可能不需要優化
- 誠實說「無明顯劫持機會」也是專業判斷
- 不要為了顯示專業而硬湊建議
`;

				// Step 4: Call OpenAI API with structured system prompt
				const completion = await openai.chat.completions.create({
					model: "gpt-5-mini-2025-08-07", // most advanced model available
					messages: [
						{
							role: "system",
							content: `## 你的角色
你是 SEO 語義劫持專家，專責分析搜尋意圖與規劃詞組等價策略。
分析指定文章的 SEO 語意劫持機會，並基於 Rank 4-10 的關鍵字數據，設計使用 Best Query 進行語意等價策略。
- Analyze the SEO intent capture potential for this article and devise strategies to leverage Rank 4-10 keyword data for semantically equivalent query planning.
`,
						},
						{
							role: "user",
							content: prompt,
						},
					],
				});

				const analysis =
					completion.choices[0]?.message?.content || "無法生成分析結果";

				// Parse sections for display
				const sections = {
					quickWins: "",
					paragraphAdditions: "",
					structuralChanges: "",
				};

				// Extract main sections with new structure
				const searchAnalysisMatch = analysis.match(
					/## 搜索特性分析[\s\S]*?(?=## 語義劫持機會|$)/,
				);
				const hijackMatch = analysis.match(
					/## 語義劫持機會[\s\S]*?(?=## 核心劫持策略|$)/,
				);
				const strategyMatch = analysis.match(
					/## 核心劫持策略[\s\S]*?(?=## 實施優先級|$)/,
				);
				const priorityMatch = analysis.match(
					/## 實施優先級[\s\S]*?(?=## 📝 必備執行項目|$)/,
				);
				const actionPlanMatch = analysis.match(/## 📝 必備執行項目[\s\S]*/);

				// Map to sections for UI display
				// Tab 1: 語意分析
				sections.quickWins =
					(searchAnalysisMatch ? searchAnalysisMatch[0] : "") +
					"\n\n" +
					(hijackMatch ? hijackMatch[0] : "");

				// Tab 2: 策略
				sections.paragraphAdditions = strategyMatch
					? strategyMatch[0]
					: "無劫持策略";

				// Tab 3: 實施建議
				sections.structuralChanges =
					(priorityMatch ? priorityMatch[0] : "無實施建議") +
					"\n\n" +
					(actionPlanMatch ? actionPlanMatch[0] : "");

				return {
					success: true,
					analysis,
					sections,
					keywordsAnalyzed: uniqueKeywords.length,
				};
			} catch (error) {
				console.error("Error in content analysis:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Analysis failed",
					analysis: "",
					sections: {
						quickWins: "",
						paragraphAdditions: "",
						structuralChanges: "",
					},
					keywordsAnalyzed: 0,
				};
			}
		}),
});
