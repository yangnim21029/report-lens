import { convert } from 'html-to-text';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { env } from '~/env';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
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
        rank10: z.string().nullable()
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Step 1: Fetch article content
        const contentResponse = await fetch(input.page, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RepostLens/1.0)'
          }
        });

        if (!contentResponse.ok) {
          throw new Error(`Failed to fetch content: ${contentResponse.status}`);
        }

        const html = await contentResponse.text();

        // Extract region from URL for language localization
        const region = input.page.includes('holidaysmart.io')
          ? input.page.match(/\/(hk|tw|sg)\//)?.[1] || 'hk'
          : 'hk';

        // Define language and locale settings
        const localeSettings = {
          hk: {
            language: '繁體中文（香港）',
            style: '港式用詞',
            examples: '係、嚟、唔、咁、啱、舖頭',
            tone: '親切、地道、生活化'
          },
          tw: {
            language: '繁體中文（台灣）',
            style: '台式用詞',
            examples: '的、來、不、這樣、對、店家',
            tone: '溫馨、在地、貼心'
          },
          cn: {
            language: '簡體中文（中國大陸）',
            style: '大陸用詞',
            examples: '的、来、不、这样、对、商家',
            tone: '專業、直接、實用'
          },
          sg: {
            language: '繁體中文（新加坡）',
            style: '星式用詞',
            examples: '的、來、不、這樣、對、店舖',
            tone: '多元、現代、簡潔'
          },
          default: {
            language: '繁體中文',
            style: '標準用詞',
            examples: '的、來、不、這樣、對、店舖',
            tone: '中性、標準、清晰'
          }
        };

        const currentLocale =
          localeSettings[region as keyof typeof localeSettings] ||
          localeSettings.default;

        // Extract meta information
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const metaDescMatch = html.match(
          /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i
        );
        const ogTitleMatch = html.match(
          /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i
        );
        const ogDescMatch = html.match(
          /<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i
        );

        const pageTitle = titleMatch ? titleMatch[1] : '';
        const metaDescription = metaDescMatch ? metaDescMatch[1] : '';
        const ogTitle = ogTitleMatch ? ogTitleMatch[1] : '';
        const ogDescription = ogDescMatch ? ogDescMatch[1] : '';

        // Helper function to extract image positions
        const extractImagePositions = (html: string) => {
          const imgRegex = /<img[^>]*>/gi;
          const images = [];
          let match;
          let count = 0;

          // Calculate text position before each image
          while ((match = imgRegex.exec(html)) && count < 3) {
            // Extract alt text
            const altMatch = match[0].match(/alt=["']([^"']*?)["']/i);
            const altText = altMatch ? altMatch[1] : '';

            // Get text before image to calculate position
            const beforeImg = html
              .substring(0, match.index)
              .replace(/<[^>]*>/g, '');
            const cleanText = beforeImg.replace(/\s+/g, ' ').trim();

            // Calculate character position
            const position = cleanText.length;

            images.push(`[圖${count + 1}:"${altText}", 位置:${position}字]`);
            count++;
          }

          return images.length > 0 ? '\n\n圖片資訊：' + images.join(', ') : '';
        };

        // Extract main article content using specific selector
        const articleMatch = html.match(
          /<article[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/article>/i
        );

        let textContent = '';
        let imageInfo = '';

        if (articleMatch && articleMatch[1]) {
          // Found main article content, extract from it
          textContent = convert(articleMatch[1], {
            wordwrap: false,
            selectors: [
              { selector: 'a', options: { ignoreHref: true } },
              { selector: 'img', format: 'skip' }
            ]
          });

          // Extract image positions
          imageInfo = extractImagePositions(articleMatch[1]);
        } else {
          // Fallback: try to find content in pl-main-article class
          const mainContentMatch = html.match(
            /<div[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/div>/i
          );
          if (mainContentMatch && mainContentMatch[1]) {
            textContent = convert(mainContentMatch[1], {
              wordwrap: false,
              selectors: [
                { selector: 'a', options: { ignoreHref: true } },
                { selector: 'img', format: 'skip' }
              ]
            });

            // Extract image positions
            imageInfo = extractImagePositions(mainContentMatch[1]);
          } else {
            // Last resort: extract title and basic content
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : '';
            textContent =
              title +
              ' ' +
              convert(html, {
                wordwrap: false,
                selectors: [
                  { selector: 'a', options: { ignoreHref: true } },
                  { selector: 'img', format: 'skip' }
                ]
              }).substring(0, 4000);

            // Extract image positions from full HTML as last resort
            imageInfo = extractImagePositions(html);
          }
        }

        // Clean up ads, navigation and unwanted content
        textContent = textContent
          .replace(/data-key="[^"]*"/g, '')
          .replace(/ad-id-[a-z0-9]+/g, '')
          .replace(/data-v-[a-f0-9]+/g, '')
          .replace(/loading\.png/g, '')
          .replace(/presslogic-hk-hd\/static\/images/g, '')
          .replace(/\/hk\/category\/[a-zA-Z-]+/g, '')
          .replace(/\/hk\/author\/[a-zA-Z-]+/g, '')
          .replace(/By [A-Za-z\s]+ on \d+ [A-Za-z]+ \d+/g, '')
          .replace(/Digital Editor/g, '')
          .replace(/香港好去處|生活熱話|購物著數|美食推介|旅遊攻略/g, '')
          .replace(/\s+/g, ' ')
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
        const removeSpaces = (str: string) => str.replace(/\s+/g, '');

        // Normalize Best Query for comparison and attribute extraction
        const bestQueryNormalized = removeSpaces(input.bestQuery || '');
        const bestQueryOriginal = input.bestQuery || '';

        // For attribute extraction, normalize the best query first
        const bestQueryForAttributes = bestQueryOriginal.replace(/\s+/g, '');
        const bestQueryChars = bestQueryForAttributes.split('');

        // Process each rank group and format with rank information
        const processRankKeywords = (rankData: string | null, rank: number) => {
          if (!rankData) return;
          const keywords = rankData.split(',').map(k => k.trim());
          keywords.forEach(keyword => {
            if (keyword) {
              // Extract keyword and clicks from format: "keyword(clicks)"
              const match = keyword.match(/^(.+?)\((\d+)\)$/);
              let kw = keyword;
              let clicks = '';

              if (match) {
                kw = match[1] ?? '';
                clicks = match[2] ?? '';
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
                const kwNormalizedForAttr = kw.replace(/\s+/g, '');
                let remainingChars = kwNormalizedForAttr;

                // Remove each character of best query from the normalized keyword
                bestQueryChars.forEach(char => {
                  remainingChars = remainingChars.replace(char, '');
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
        allKeywords.forEach(kw => {
          const normalized = kw.replace(/\s+/g, '');
          // Keep the first occurrence of each normalized form
          if (!normalizedKeywordMap.has(normalized)) {
            normalizedKeywordMap.set(normalized, kw);
          }
        });

        // Get unique keywords based on normalized form
        const uniqueKeywords = Array.from(normalizedKeywordMap.values()).filter(
          Boolean
        );
        const attributesList = Array.from(attributeWords);

        // Step 3: Create structured prompt with proper AI mindset
        const prompt = `# TASK
分析這篇文章的 SEO 語義劫持機會，設計如何用 Rank 4-10 的關鍵詞數據，來 Best Query 做語意等價策略。

# CONTEXT
文章URL: ${input.page}
地區語言: ${currentLocale.language} - ${currentLocale.style}
語言特色: ${currentLocale.examples}
語調要求: ${currentLocale.tone}
現有標題: ${pageTitle}
Meta 描述: ${metaDescription}
OG 標題: ${ogTitle}
Best Query（排名1-3）: 「${input.bestQuery || '未知'}」 - ${
          input.bestQueryClicks || 0
        } 次點擊 - 平均排名 ${input.bestQueryPosition || '未知'}
前期 Best Query: ${
          input.prevBestQuery
            ? `「${input.prevBestQuery}」 - ${
                input.prevBestClicks || 0
              } 次點擊 - 平均排名 ${input.prevBestPosition || '未知'}`
            : '無數據'
        }
是否有變化：${input.prevBestQuery && input.bestQuery !== input.prevBestQuery}

關鍵詞列表（Rank 4-10）：
${keywordsList.join('\n')}

# 數據格式說明
- 每個關鍵詞格式：keyword (rank: X, clicks: Y)
- rank: 在 Google 的平均排名位置
- clicks: 過去14天總點擊數
- 重要：低點擊詞通常是決策摩擦低的具體詞（用戶需要但不熟悉）
- 重要：高點擊詞通常是決策摩擦高的廣泛詞（用戶熟悉但太廣泛）
- 前後主要用詞不同：若 Best Query 變化表示狹持失敗/成功，看目前是否為短尾字詞。

文章內容片段：
${textContent.substring(0, 4000)}

# WARNING FOR ACTING
- 你是 SEO 語義劫持專家，不是關鍵詞填充機器
- 🎯 核心目標：識別有顯著性的低摩擦詞，建立與 Best Query 的語義等價
- 🔍 關鍵詞評估原則：
  - Rank 4-10 的詞已經能搜到文章，分析其與 Best Query 的需求一致性
  - 所需資訊一致性 = 用戶搜這個詞和搜 Best Query 的所需資訊是否可以一概而論
  - 決策摩擦 = 用戶執行難度（可透過內容優化）
  - 找出：與 Best Query 所需資訊一致 + 低摩擦的詞 = 劫持機會
  - 例：搜「梅州 船票」和搜「梅州交通」的所需資訊一致（其實該地區顯著部分都要去搭船）= 可劫持
- 🚨 重要：評估每個策略與現有切角的關係
  - 平行判斷規則：若新劫持策略需在最佳文章佔比 >10% = 平行切角
  - 可融合（≤10%）：策略與現有內容相關，可在原文實現
  - 平行無法涵蓋（>10%）：策略與現有切角平行，需要新文章
  - 誠實評估需要的內容量，據此判斷
- 決策摩擦 = 用戶從搜索到行動的路徑難度：
  - 低摩擦：具體明確，0-1 步就能行動（Tableau、船票、戲院）
  - 高摩擦：廣泛模糊，需要 2+ 步決策（數據分析、交通、好去處）
- 劫持公式：具體方案 + 廣泛問題 = 降低決策摩擦
  - 「Tableau 教學」+「數據分析」= 用戶直接學，不用選工具
  - 「梅州船票」+「交通攻略」= 用戶直接買票，不用比較交通方式
  - 「太古城戲院」+「室內好去處」= 用戶直接去，不用挑選
- SEO 劫持原理：
  - 具體詞的顯著性 = 它能代表廣泛詞的程度
  - Google 認為「Tableau 數據分析教學」⊂「大數據分析」
  - 搜「大數據分析」會匹配到「Tableau 教學」（因為 Tableau 有顯著性）
  - 顯著性 + 低摩擦 = SEO 價值
- 你要基於數據分析，不是憑空想像
- 必須使用指定的地區語言風格，標題建議要符合當地表達習慣

# TO DO
1. 分析 Best Query 的核心概念和用戶需求
2. 評估 Rank 4-10 每個詞與 Best Query 的需求一致性
3. 語意等價，想看到的資訊一致 + 低摩擦 + 好搜的詳細介紹 A 就可替代 B（主要劫持機會）
4. 設計語義等價策略：如何讓這些詞 = Best Query（詳細介紹 A 就可替代 Best Query)
5. 評估內容調整的可行性
6. 判斷內容策略（使用10%規則判斷）：
   - REPOST 條件：
     * 策略在最佳文章佔比 ≤10%（與現有切角可融合）
     * 新增內容可控制在原文 5% 以內
     * 主要透過標題優化、內容重組來實現
   - NEW POST 條件：
     * 策略在最佳文章佔比 >10%（平行切角）
     * 需要新增內容超過原文 5%
     * 需要改變文章主題焦點
   - 判斷重點：先用10%規則判斷切角關係，再評估內容量
7. 根據策略判斷，提供對應的具體執行清單

# DON'T DO
- 不要理會錯字變體（如：劉德華vs摟德华vs留的滑）- Google已能識別
- 不要憑空想像大詞（如：男星、香港）- 這些不在數據中，是優化後自然獲得的
- 不要機械地建議「加入這個關鍵詞」
- 不要單獨評估詞彙顯著性 - 要看與 Best Query 的需求一致性
- 不要把簡潔內容改成冗長（如：172cm → 據報導是172cm）
- 不要忽視搜索意圖（如：室內好去處 ≠ 我要去特定景點）
- 不要盲目建議「新增關鍵詞」- 除非是遺漏了可劫持的詞
- 不要堆砌詞彙 - 要思考如何降低用戶決策摩擦，控制概念定義權
- 不要建議刪減原有內容 - 需要刪減表示切角不同，應建議寫新文章
- 分析詞組之間的劫持關係，看具體詞能否代表廣泛詞
- 例：「劉德華身高」vs「郭富城身高」沒有劫持關係，是平行概念
- 不要亂改地區用詞 - 尊重關鍵詞本身的地區表達習慣
- 例：「海龜湯」vs「揭尾故」是不同地區的用詞，不要強行統一或修改
- 保持原有關鍵詞的地區特色和用語習慣

# CONTEXT OF TASK
當如果搜索"梅州交通"時，出現"梅州船票"這種結果，因為：
船票的優勢：
更直接的決策路徑：看到→點擊→購買
更高的餘弦相似度：船票=交通工具，完全匹配
零決策摩擦：不需要思考"最佳方案"

真正的解決方案
需要重新思考"梅州交通"的搜索意圖：
用戶真正想要什麼？
不是"交通方式的比較"，而是"我現在就要去梅州"

關鍵洞察：
不要解釋為什麼選這個交通方式
不要提供"最佳方案分析"

最短決策路徑 = 零解釋 

語義等價 = 搜索霸權
船票文章的SEO天才之處：

讓「梅州船票」= 「梅州交通」在搜索引擎的理解中
一篇文章吃掉兩個關鍵詞的流量
創造了新的搜索習慣

這個策略的威力
用戶行為重塑：
原本：搜"梅州交通" → 看到各種交通方式 → 比較選擇
現在：搜"梅州交通" → 直接看到船票 → 點擊購買

搜索引擎學習：

用戶搜"梅州交通"但點擊"船票"
引擎判定：用戶滿意度高
下次更優先推薦船票結果

內容策略

讓文章被收錄為"梅州交通"
但實際解決"梅州船期"的需求
創造「梅州船期」= 「梅州交通」的語義等價

# RETURN FORMAT

## 搜索特性分析
分析 ${input.bestQuery} 的決策摩擦：
- 範圍
- 是否缺乏具體意圖
- 模糊
- 目前文章的主要關鍵字是否改變？（例如：主要用詞從「海龜湯題目」變為「海龜湯題目恐怖」，代表語意劫持失敗，難以用「海龜湯題目恐怖」來劫持「海龜湯題目」）

## 語義劫持機會
### 與 Best Query 需求一致性分析（Rank 4-10）[需理解隱藏的詞義，如「梅州船期」和「梅州交通」的需求一致性]
屬性詞彙（從關鍵詞中提取，移除主詞後的特徵詞）：${
          attributesList.length > 0 ? attributesList.join(', ') : '無明顯屬性詞'
        }
- 可以詳細敘述的詞：[與「${
          input.bestQuery || '未知'
        }」所需資訊一致，水平詞，並不能劫持主詞]
- 垂直用詞，通常會帶出${input.bestQuery}更細節資訊的用詞：...
- 遠距離詞：[與「${
          input.bestQuery || '未知'
        }」所需資訊方向不同，也不容易劫持主詞]

## 策略
[讓一個具體詞 = Best Quey 的詞語，能夠做到 SEO 霸權]
[根據前述分析，提供最佳的語意等價 SEO 策略]

（需要注意，策略發現新角度，可能會涵蓋更多不存在此文章的詞，也屬於豐富列表）
（也可以考慮使用遠距詞，New Post 創造新的切角）

### 策略一：[策略名稱]
**劫持組合**：「[具體詞]」等價「[廣泛詞]」
**詞組關係**：[水平/垂直/遠距離]
**預計新增的文字量**：豐富列表/單薄主題（若為豐富列表，需要 NewPost)
**優化類型**：[REPOST / NEW POST]

### 策略二：[策略名稱]
**劫持組合**：「[具體詞]」等價「[非 Main Query]」
**詞組關係**：[水平/垂直/遠距離]
**預計新增的文字量**：豐富列表/單薄主題（若為豐富列表，需要 NewPost)
**優化類型**：[REPOST / NEW POST]


### 優化類型
- [NEW POST / REPOST]（如果上述策略中，有出現 REPOST 優化，可以優先選擇 REPOST 避免太多工作）
注意：新增豐富列表是限制，我們不可能在 REPOST 中新增超過 10% 的內容，豐富列表需要 NEW POST。

## 實施優先級

### 📈 短期優化（1天內）[根據優化類型，選擇描述兩到三點]
- [例如，內容結構調整]
- [例如，新增哪些段落]
- [例如，關鍵詞自然融入策略]

### 🎯 語義劫持布局（1週內）[描述兩到三點]
- 
-
- 

## 📝 執行清單

[根據上述判斷，提供對應的執行清單]

### [如果是 REPOST ]
1. [將「${pageTitle}」改為「[新標題]」] 
2. [具體要加什麼]
3. [調整哪些內容的順序]

### [如果是 NEW POST ]
1. 新文章主題：[如「動森SS級島民完整個性圖鑑」] 
2. 主題方向：[處理需要大量篇幅的關鍵詞]
3. 新切角：[如「完整介紹4個SS級島民需要約15%新內容」]
`;

        // Step 4: Call OpenAI API with structured system prompt
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `# YOUR ROLE
你是 SEO 語義劫持專家，專門分析搜索意圖並設計語義等價策略。

# CORE PRINCIPLE
決策摩擦 = 用戶從搜索到行動的路徑難度
- 低摩擦：具體明確，直接行動（Tableau教學、船票、戲院）
- 高摩擦：廣泛模糊，需要多步決策（數據分析、交通、好去處）
- 資訊需求一致性：評估詞彙與 Best Query 的用戶資訊需求是否相同
  例：搜「梅州船期」和「梅州交通」需求一致（都想了解搭船資訊）
  反例：搜「島民圖鑑」和「島民房屋」需求不同（前者看島民，後者看裝潢）
- SEO 價值：需求一致 + 低摩擦 = 劫持機會

# HOW TO THINK
- 策略評估思維：
  - 這個比重反映了主題的相關性和融合難度
- 劫持成功條件：
  - 詞彙顯著解釋了 Best Query 實際的需求
  - 詞彙決策摩擦比 Best Query 低（具體明確，易執行）
  - 在現有切角可融合此詞彙屬性，且具有顯著性（適合一起放入標題，垂直詞）
  - 例：「島民 SS級」與「島民排名」需求一致且可融合
  - 例：「某個SS級島民」更像是特定島名資訊，與「島民排名」就不一樣，適合另一開篇文章
- 判斷策略：
  - REPOST：目標詞 + 垂直詞，改動≤20%
  - NEW POST：需要新切角或改動>20%
  - 例：文章講「劉德華身高」，「郭富城身高」兩者複雜度一致，難以垂直搭配 → NEW POST

# OUTPUT QUALITY
- 簡潔直接：核心洞察控制在3-5句
- 基於數據：引用實際關鍵詞，不憑空想像
- 執行清單具體明確：
  好：「將標題從"襯衫扣法技巧"改為"襯衫扣法的個性表達"」
  好：「在第二段補充"襯衫只扣第一顆"和"襯衫錯位扣法"這兩個遺漏的詞」
  壞：「優化標題」「調整結構」`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        });

        const analysis =
          completion.choices[0]?.message?.content || '無法生成分析結果';

        // Parse sections for display
        const sections = {
          quickWins: '',
          paragraphAdditions: '',
          structuralChanges: ''
        };

        // Extract main sections with new structure
        const searchAnalysisMatch = analysis.match(
          /## 搜索特性分析[\s\S]*?(?=## 語義劫持機會|$)/
        );
        const hijackMatch = analysis.match(
          /## 語義劫持機會[\s\S]*?(?=## 策略|$)/
        );
        const strategyMatch = analysis.match(
          /## 策略[\s\S]*?(?=## 實施優先級|$)/
        );
        const priorityMatch = analysis.match(
          /## 實施優先級[\s\S]*?(?=## 📝 執行清單|$)/
        );
        const actionPlanMatch = analysis.match(/## 📝 執行清單[\s\S]*/);

        // Map to sections for UI display
        // Tab 1: 語意分析
        sections.quickWins =
          (searchAnalysisMatch ? searchAnalysisMatch[0] : '') +
          '\n\n' +
          (hijackMatch ? hijackMatch[0] : '');

        // Tab 2: 策略
        sections.paragraphAdditions = strategyMatch
          ? strategyMatch[0]
          : '無劫持策略';

        // Tab 3: 實施建議
        sections.structuralChanges =
          (priorityMatch ? priorityMatch[0] : '無實施建議') +
          '\n\n' +
          (actionPlanMatch ? actionPlanMatch[0] : '');

        return {
          success: true,
          analysis,
          sections,
          keywordsAnalyzed: uniqueKeywords.length
        };
      } catch (error) {
        console.error('Error in content analysis:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Analysis failed',
          analysis: '',
          sections: {
            quickWins: '',
            paragraphAdditions: '',
            structuralChanges: ''
          },
          keywordsAnalyzed: 0
        };
      }
    })
});
