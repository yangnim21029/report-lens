import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const analyseResult = body?.analysisText || body?.analysis || body?.analyseResult || '';
    const outline = body?.outlineText || body?.outline || '';

    if (!analyseResult || !outline) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: analysisText and outlineText are required"
        },
        { status: 400 }
      );
    }

    const descriptionPrompt = `你是資深的 SEO 內容策略專家，擅長分析關鍵字難度與索引優化。

# 任務目標
分析大綱中每個 h2/h3 標題的 SEO 索引難度，並提供降低難度的策略建議。

# 分析目標
${analyseResult}

# 分析方法
對每個標題，從以下多個維度評估索引難度（1-10分，10分最難）：

## 1. 競爭度分析 (Competition Score)
- 關鍵字搜尋量與競爭程度
- 是否為高競爭的通用詞（如「如何賺錢」）vs 長尾關鍵字（如「2025年台灣遠端工作如何報稅」）
- 評分：1-3分（低競爭長尾詞）、4-7分（中等競爭）、8-10分（高競爭通用詞）

## 2. 內容深度需求 (Content Depth Score)
- 需要多少字數才能滿足搜尋意圖
- 是否需要專業知識、數據、案例
- 評分：1-3分（簡單定義）、4-7分（需要詳細說明）、8-10分（需要深度研究）

## 3. 使用者意圖匹配度 (Intent Match Score)
- 標題是否清楚回應使用者搜尋意圖
- 是否容易產生點擊（CTR）
- 評分：1-3分（意圖明確）、4-7分（需要優化）、8-10分（意圖模糊）

## 4. 結構化資料潛力 (Structured Data Score)
- 是否適合 Featured Snippet、FAQ、How-to 等結構
- 評分：1-3分（高潛力）、4-7分（中等）、8-10分（難以結構化）

## 5. 語義相關性 (Semantic Relevance Score)
- 標題與主題的語義關聯強度
- LSI 關鍵字覆蓋度
- 評分：1-3分（高相關）、4-7分（中等）、8-10分（弱相關）

# 輸出格式

對每個 h2/h3 標題，輸出以下格式：

h2 [標題文字]
難度評分：[總分]/50 (競爭度: X, 內容深度: X, 意圖匹配: X, 結構化: X, 語義相關: X)
[策略建議：具體說明如何降低索引難度，包括：
1. 關鍵字優化建議（加入長尾詞、地區詞、時間詞等）
2. 內容結構建議（使用列表、表格、步驟等）
3. 語義擴充建議（相關詞彙、同義詞）
4. Featured Snippet 優化建議
5. 其他 SEO 技巧]

h3 [標題文字]
難度評分：[總分]/50 (競爭度: X, 內容深度: X, 意圖匹配: X, 結構化: X, 語義相關: X)
[策略建議...]

# 策略建議範例

好的建議：
[難度評分：18/50 (競爭度: 4, 內容深度: 3, 意圖匹配: 2, 結構化: 5, 語義相關: 4)
策略建議：
1. 關鍵字優化：將「送長輩祝福語」改為「2025蛇年送長輩四字祝福語大全」，加入年份與具體格式降低競爭
2. 內容結構：使用表格呈現「場合-祝福語-使用情境」三欄式結構，提高 Featured Snippet 機會
3. 語義擴充：加入「拜年」、「過年」、「新春」、「吉祥話」等相關詞彙
4. 數量化：明確標示「精選50句」提升點擊率
5. 使用情境：針對不同場合（拜訪、電話、訊息）分類，提高實用性]

不好的建議：
[寫一些祝福語就好]
[多寫一點內容]
[加入關鍵字]

# 大綱內容
${outline}

# 注意事項
- 不要有語言/地區偏好，使用中性用詞
- 評分要客觀，基於實際 SEO 難度
- 策略建議要具體可執行，不要空泛
- 保持原本的 h2/h3 結構不變
- 每個建議都要能直接降低索引難度
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        {
          role: "user",
          content: descriptionPrompt,
        },
      ],
    });

    const generatedContent = completion.choices[0]?.message?.content?.trim() || "";

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: "Failed to generate SEO analysis" },
        { status: 502 }
      );
    }

    const cleanedContent = generatedContent.replace(/^---+\s*$/gm, '').trim();
    console.log(`[write/description] Generated SEO analysis: ${cleanedContent.substring(0, 200)}...`);

    // 按 h2 分割段落
    const h2Sections = cleanedContent.split(/(?=h2\s)/i).filter(section => section.trim().length > 50);

    let paragraphs = [];

    if (h2Sections.length > 1) {
      paragraphs = h2Sections.map(section => section.trim());
      console.log(`[write/description] Split by h2: found ${paragraphs.length} sections`);
    } else {
      const doubleLine = cleanedContent.split(/\n\s*\n/).filter(section => section.trim().length > 100);

      if (doubleLine.length > 1) {
        paragraphs = doubleLine.map(section => section.trim());
        console.log(`[write/description] Split by double newlines: found ${paragraphs.length} sections`);
      } else {
        paragraphs = [cleanedContent];
        console.log(`[write/description] No splitting possible, using single paragraph`);
      }
    }

    console.log(`[write/description] Final paragraphs count: ${paragraphs.length}`);

    return NextResponse.json({
      success: true,
      content: cleanedContent,
      description: cleanedContent,
      paragraphs: paragraphs,
      metadata: {
        totalParagraphs: paragraphs.length,
        contentLength: cleanedContent.length,
        model: "gpt-5-mini-2025-08-07",
        analysisType: "seo-difficulty-scoring"
      }
    });

  } catch (error) {
    console.error('[write/description] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      { status: 500 }
    );
  }
}
