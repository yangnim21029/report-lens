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

    // 使用你的原始 prompt template
    const descriptionPrompt = `目標設定如此：${analyseResult}
    
    ----
把大綱中的每一段h2h3要寫什麼，用一段話說明在[...]內，需要能幫我排名 SEO
detailing its content.

SEO 的理由可能包括以下，但不限於：
同時向搜尋引擎清晰展示頁面的完整結構與層次，提升使用者體驗與爬蟲抓取效率。
核心搜尋意圖，爭取在搜尋結果頁面（SERP）中成為 Google 的精選摘要（Featured Snippet），搶佔零點擊搜尋的最高位置。
類高意圖的長尾關鍵字查詢
快速滿足使用者對關鍵字的好齊心
特定角色搜尋的高度相關性，鞏固關鍵字密度。
豐富內容的語義詞彙，提升使用者在頁面的停留時間，展示頁面的權威性。
爭取 Google 圖片搜尋的排名，帶來額外流量。
精煉語句，快速定義
直接回應關鍵字的查詢，並強調內容特徵的重要性
旨在滿足使用者對具體的長尾搜尋需求。
讓搜尋引擎理解此頁面提供了超越基本介紹的深度資訊
...

以下是 outline:
${outline}

output format:
h2 xxx
h3 xxx
[...]
h3 xxx
[...]
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
        { success: false, error: "Failed to generate content description" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      content: generatedContent,
      description: generatedContent,
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
