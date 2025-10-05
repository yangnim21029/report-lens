import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const paragraphOutputs = body?.paragraphOutputs || [];
    const generateContentOutputs = body?.generateContentOutputs || [];
    
    // 支持單個或批量處理
    const singleParagraphOutput = body?.paragraphOutput || body?.paragraph_output || '';
    const singleGenerateContentOutput = body?.generateContentOutput || body?.generate_content_output || '';
    
    const inputParagraphOutputs = paragraphOutputs.length > 0 ? paragraphOutputs : (singleParagraphOutput ? [singleParagraphOutput] : []);
    const inputGenerateContentOutputs = generateContentOutputs.length > 0 ? generateContentOutputs : (singleGenerateContentOutput ? [singleGenerateContentOutput] : []);

    if (inputParagraphOutputs.length === 0 || inputGenerateContentOutputs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: paragraphOutputs and generateContentOutputs are required"
        },
        { status: 400 }
      );
    }

    if (inputParagraphOutputs.length !== inputGenerateContentOutputs.length) {
      return NextResponse.json(
        {
          success: false,
          error: "paragraphOutputs and generateContentOutputs must have the same length"
        },
        { status: 400 }
      );
    }

    console.log(`[final-content] Processing ${inputParagraphOutputs.length} paragraphs`);

    // 處理多個段落的異步請求
    const processPromises = inputParagraphOutputs.map(async (paragraphOutput: string, index: number) => {
      const generateContentOutput = inputGenerateContentOutputs[index];
      
      if (!paragraphOutput || !generateContentOutput || typeof paragraphOutput !== 'string' || typeof generateContentOutput !== 'string') {
        return {
          index,
          success: false,
          error: "Empty or invalid input",
          content: ""
        };
      }

      try {
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
5. 只輸出文章內容，並過濾文章內容，不要包含任何分析、註解或說明，或是與主題無關的內容，尤其是各種策略建議
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
          throw new Error("Failed to generate content");
        }

        console.log(`[final-content] Paragraph ${index + 1} processed: ${finalContent.length} chars`);

        return {
          index,
          success: true,
          content: finalContent,
          finalContent: finalContent,
          metadata: {
            contentLength: finalContent.length,
            paragraphOutputLength: paragraphOutput.length,
            generateContentOutputLength: generateContentOutput.length
          }
        };

      } catch (error) {
        console.error(`[final-content] Error processing paragraph ${index + 1}:`, error);
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

    console.log(`[final-content] Batch completed: ${successCount}/${results.length} successful, total ${totalLength} chars`);

    return NextResponse.json({
      success: true,
      results: results,
      metadata: {
        totalParagraphs: inputParagraphOutputs.length,
        successCount,
        totalContentLength: totalLength,
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
