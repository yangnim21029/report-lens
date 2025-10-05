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
    const descriptionPrompt = `你是資深的內容行銷廣告設計師
    
    目標設定如此：${analyseResult}
    
    ----
把大綱中的每一段h2h3要寫什麼，用一段話說明在[...]內，需要能幫我排名 SEO
detailing its content.

不要有語言/地區偏好，使用中性的用詞

問自己：
- 你的內容主要是寫給誰看的？是學生、上班族、媽媽、還是企業老闆？了解他們是誰，才能寫出他們感興趣的內容。
- 你希望讀者看完後做什麼？是為了提升網站流量、提高某個關鍵字的搜尋排名、獲得更多的銷售機會，還是單純建立品牌形象？
- 為了達到你的目標，文章裡 必須包含 哪些重要的資訊、賣點、或數據？這些是內容的骨幹，缺一不可。
- 你希望品牌給人什麼樣的感覺？是專業權威、親切友善、輕鬆有趣，還是溫暖感性？這會決定你用字遣詞的方式。

  [...]內的文字，要思考具有行銷效果的呈現方式，不要只是簡單條列式

你的輸出不應該包含分析內容，應該維持原本的h2h3不改

[] 描述示範：
[精選一系列送俾長輩嘅四字祝福語，句句都係祝賀身體健康、萬事如意嘅吉祥話，夠晒得體又顯孝心。]
[收集最新、最搞鬼嘅蛇年諧音四字祝福，等你可以喺 WhatsApp Group 同 IG Story 度引爆笑彈，做個最幽默嘅朋友。]
[我哋將精選揮春設計成 A4 大小嘅 PDF 檔案，方便你隨時下載列印，安坐家中都可以自製揮春。]


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

    // 清理內容：移除 --- 分隔符避免干擾 h2 分割
    const cleanedContent = generatedContent.replace(/^---+\s*$/gm, '').trim();
    console.log(`[write/description] Original content: ${cleanedContent.substring(0, 200)}...`);
    
    // 檢查是否移除了分隔符
    if (generatedContent !== cleanedContent) {
      console.log(`[write/description] Removed --- separators from content`);
    }
    
    // 先嘗試按 h2 分割 (使用清理後的內容)
    const h2Sections = cleanedContent.split(/(?=h2\s)/i).filter(section => section.trim().length > 50);
    
    let paragraphs = [];
    
    if (h2Sections.length > 1) {
      paragraphs = h2Sections.map(section => section.trim());
      console.log(`[write/description] Split by h2: found ${paragraphs.length} sections`);
    } else {
      // 如果沒有 h2，嘗試按其他方式分割
      console.log(`[write/description] No h2 found, trying alternative splitting`);
      
      // 嘗試按雙換行分割
      const doubleLine = cleanedContent.split(/\n\s*\n/).filter(section => section.trim().length > 100);
      
      if (doubleLine.length > 1) {
        paragraphs = doubleLine.map(section => section.trim());
        console.log(`[write/description] Split by double newlines: found ${paragraphs.length} sections`);
      } else {
        // 最後回退到單一段落
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
        model: "gpt-5-mini-2025-08-07"
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
