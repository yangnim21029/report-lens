import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const paragraphs = body?.paragraphs || [];
    const paragraph = body?.paragraph || '';
    const brand = body?.brand || '';

    // 支持單個段落或多個段落
    const inputParagraphs = paragraphs.length > 0 ? paragraphs : (paragraph ? [paragraph] : []);

    if (inputParagraphs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: paragraph or paragraphs"
        },
        { status: 400 }
      );
    }

    console.log(`[chat-and-structure] Brand: ${brand}`);
    console.log(`[chat-and-structure] Processing ${inputParagraphs.length} paragraphs`);

    // 處理多個段落的異步請求
    const processPromises = inputParagraphs.map(async (para: string, index: number) => {
      if (!para || typeof para !== 'string' || para.trim().length === 0) {
        return {
          index,
          success: false,
          error: "Empty paragraph",
          content: ""
        };
      }

      try {
        const structurePrompt = `你試試寫這一段，寫法是先想像兩個人物對談，再將資訊加工，整理成適合 SEO 的脈絡格式（問題陳述，嚴重性，解決方案）。
輸出對談與整理結果
對話的是兩個台灣人
語言不要有偏好，要使用中性的字眼，通俗易懂
每個題目都要單獨有自己的對談，最後整理的資訊，都不冗長，直接說明
討論時，要避免使用品牌客戶不喜歡的方式
要知道品牌用戶的大家喜歡聽什麼？（來自問問大家的想法，這樣才能對話，才是清晰、有趣且貼心）

品牌客戶：${brand || "由你決定最適合的品牌設定"}
請確保最後『對話內容整理』的用詞與邏輯順序，能反映（或呼應）前方『對話內容』的鋪陳。讓整理結果看起來像是從人物對話中直接提煉的重點。

你會寫：
主題：
對話人物設定：
對話內容：
品牌受眾研究：
對話內容整理：
---

寫這一段：${para}
...
`;

        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini-2025-08-07",
          messages: [
            {
              role: "user",
              content: structurePrompt,
            },
          ],
        });

        const generatedContent = completion.choices[0]?.message?.content?.trim() || "";

        if (!generatedContent) {
          throw new Error("Failed to generate content");
        }

        console.log(`[chat-and-structure] Paragraph ${index + 1} processed: ${generatedContent.length} chars`);

        return {
          index,
          success: true,
          content: generatedContent,
          metadata: {
            paragraphLength: para.length,
            contentLength: generatedContent.length
          }
        };

      } catch (error) {
        console.error(`[chat-and-structure] Error processing paragraph ${index + 1}:`, error);
        return {
          index,
          success: false,
          error: error instanceof Error ? error.message : "Processing error",
          content: ""
        };
      }
    });

    // 等待所有段落處理完成
    const results = await Promise.all(processPromises);

    // 統計結果
    const successCount = results.filter(r => r.success).length;
    const totalLength = results.reduce((sum, r) => sum + (r.metadata?.contentLength || 0), 0);

    console.log(`[chat-and-structure] Batch completed: ${successCount}/${results.length} successful, total ${totalLength} chars`);

    return NextResponse.json({
      success: true,
      results: results,
      metadata: {
        brand,
        totalParagraphs: inputParagraphs.length,
        successCount,
        totalContentLength: totalLength,
        model: "gpt-5-mini-2025-08-07"
      }
    });

  } catch (error) {
    console.error('[chat-and-structure] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      { status: 500 }
    );
  }
}