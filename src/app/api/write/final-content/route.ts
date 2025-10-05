import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const paragraphOutput = body?.paragraphOutput || body?.paragraph_output || '';
    const generateContentOutput = body?.generateContentOutput || body?.generate_content_output || '';

    if (!paragraphOutput || !generateContentOutput) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: paragraphOutput and generateContentOutput are required"
        },
        { status: 400 }
      );
    }

    console.log(`[final-content] Processing paragraph output: ${paragraphOutput.substring(0, 100)}...`);
    console.log(`[final-content] Processing generated content: ${generateContentOutput.substring(0, 100)}...`);

    const finalContentPrompt = `你是一位專業的內容編輯，現在需要根據以下資料撰寫最終的文章段落。

參考資料：

【原始段落大綱】
${paragraphOutput}

【AI 生成的對話內容與結構】
${generateContentOutput}

---

任務要求：
1. 請盡量使用「AI 生成的對話內容與結構」中的內容作為主要素材
2. 將對話內容轉化為流暢的文章段落
3. 保留對話中的重點資訊、數據、例子
4. 使用 Markdown 格式撰寫
5. 只輸出文章內容，不要包含任何分析、註解或說明
6. 保持語氣自然、易讀
7. 確保內容完整且有邏輯性

請直接輸出 Markdown 格式的文章段落：`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        {
          role: "user",
          content: finalContentPrompt,
        },
      ],
    });

    const finalContent = completion.choices[0]?.message?.content?.trim() || "";

    if (!finalContent) {
      return NextResponse.json(
        { success: false, error: "Failed to generate final content" },
        { status: 502 }
      );
    }

    console.log(`[final-content] Generated final content: ${finalContent.length} characters`);

    return NextResponse.json({
      success: true,
      content: finalContent,
      finalContent: finalContent,
      metadata: {
        contentLength: finalContent.length,
        paragraphOutputLength: paragraphOutput.length,
        generateContentOutputLength: generateContentOutput.length,
        model: "gpt-5-mini-2025-08-07"
      }
    });

  } catch (error) {
    console.error('[final-content] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      { status: 500 }
    );
  }
}
