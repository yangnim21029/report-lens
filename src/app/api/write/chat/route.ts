import { NextResponse } from "next/server";
import { getVertexTextModel } from "~/server/vertex/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const paragraphs = body?.paragraphs || [];
    const paragraph = body?.paragraph || '';

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

    console.log(`[chat] Processing ${inputParagraphs.length} paragraphs`);

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
        const structurePrompt = `你是話題討論專家

# 核心思考
避免寫得像是 AI。

# 任務目標
根據提供的主題，設計兩位台灣人物的自然對話討論其中的話題（不是怎麼寫的話題）。

## 寫作方式
- 閱讀提供的 paragraph 主題：${para}
- 設計兩位台灣人物的對話討論

### 規範
- 需研究主題，捕捉與主題及細節緊密相關的內容，包括觀眾感興趣的問題陳述、生活困境（relatable struggles）、與觸動人心的高光時刻（worthy moments）
- 對話須由兩位台灣人物組成，內容必須平實、親切、中性用語，避免偏頗
- 每個主題須有獨立的對話設定及對話內容
- 對話討論須真實自然，避免條列分點；需用簡單對白並直白說明內容，且不冗長
- 對話反映實際生活細膩描述，呼應普遍關心的話題與細節
- 不需提供購買需求角度，應聚焦於人物互動、細膩感受和理解

### 對話內容設定
1. 兩位台灣人物，性別不限
2. 用語保持中性、親民易懂
3. 聚焦於受眾關心的話題（來自社群、真實需求）

### 品牌設置
品牌與受眾設定：由你決定最適合的品牌設定

討論時，要知道品牌用戶喜歡聽什麼（來自問問大家的想法，這樣才能對話，才是清晰、有趣且貼心），而不是購物需求偏好。

## 輸出格式要求
主題：討論的主題名稱
對話人物設定：兩人物設定
對話內容：兩人對話內容
品牌受眾研究：品牌／受眾觀察洞察（選填）

對話內容建議長一些，要模擬真實對話，不要列點。
要使用簡單、對話、直白的敘述。
利用對話中的細節說出他們的心聲。
保持一般的討論，不要變成社論。

---
示範輸出：

主題：
主角「吉伊」全介紹：為何愛哭的牠，卻能成為大家的心靈寄託？

對話人物設定：
小安：剛入坑《吉伊卡哇》的新手粉絲，對主角吉伊充滿好奇，但又不太理解牠的魅力。
美紀：資深粉絲，能從吉伊的行為中解讀出深層的情感與故事。

對話內容：
小安：「美紀，我最近一直在看吉伊的短篇漫畫，真的好心疼喔！牠是不是一直在哭啊？感覺做什麼事都笨手笨腳的，超級不憫（可憐）的。」

美紀：「對，愛哭跟膽小就是『吉伊』最明顯的標籤。但你不覺得，牠雖然一直在哭，卻從來沒有真的放棄嗎？這就是大家喜歡牠的原因。」

小安：「嗯…好像是耶。像牠去考那個『拔草檢定5級』，明明很努力練習，結果還是因為緊張跟壓力太大失敗了，躲在牆角哭，那一幕我真的看到快哭了。」

美紀：「沒錯！那個就是經典故事之一。牠很渴望靠自己的力量變強、賺錢，讓好朋友小八貓過好日子，但能力就是跟不上。這種『很努力卻總是被現實打敗』的無力感，跟我們現實生活中遇到的挫折很像，所以很容易投射情感在牠身上。」

小安：「我懂了！牠不只是單純的愛哭鬼。那牠有什麼優點嗎？」

美紀：「當然有！吉伊最棒的優點就是『善良』。牠雖然自己也很窮，但看到朋友想要什麼，會默默記下來，努力賺錢買給對方。而且，雖然牠自己戰鬥力很弱，但朋友遇到危險時，牠還是會拿出不成樣子的武器，發抖著擋在前面。牠的溫柔是發自內心的。」

小安：「天啊，你這樣一講，我整個對牠改觀了。牠是一個『就算自己很糟，也想對別人好』的角色。難怪看到牠哭，大家不是嘲笑牠，而是想給牠秀秀（安慰）。」

美紀：「就是這樣！牠代表了我們內心最柔軟、最脆弱，但又最善良的那一面。看著吉伊努力生活的樣子，好像也給了我們這些在現實中掙扎的普通人一點點力量。」

品牌受眾研究：
品牌客戶：Gamer 女性遊戲新聞站
受眾分析：
情感投射需求：女性玩家社群在看待角色時，非常注重情感連結。她們喜歡那些不完美、有掙扎、能反映現實生活壓力的角色。吉伊的「廢柴感」與「努力」之間的矛盾，完美擊中了這一點。

共鳴與療癒：這類受眾在遊戲與ACG中尋求的不僅是娛樂，還有心靈的療癒與慰藉。吉伊的故事提供了「就算失敗也沒關係，你的善良與努力有人懂」的溫暖感受。

故事性與迷因：「拔草檢定」這類有記憶點的經典故事，不僅豐富了角色的立體感，也成為社群傳播的絕佳素材（迷因）。受眾喜歡分享這些「懂的都懂」的小故事，藉此找到同好，建立社群認同感。

細節控：她們會關注角色的細微行為與動機，並樂於解讀。對話中提到「為了朋友而努力」的細節，能滿足她們對角色深度挖掘的偏好。

溝通策略：避免只停留在「很可愛、愛哭」的表面印象。透過具體的故事情節（拔草檢定）來深化角色的形象，從「弱小」延伸到「善良」與「堅韌」，將角色的魅力從單純的外表提升到能引發深刻情感共鳴的層次，讓讀者感覺「更懂吉伊了」。

---
請直接輸出對話內容，不需要列出執行步驟或自我檢查說明。
`;
        const model = getVertexTextModel();
        const resp = await model.generateContent(structurePrompt);
        const generatedContent =
          resp.response?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() || "";

        if (!generatedContent) {
          throw new Error("Failed to generate content");
        }

        console.log(`[chat] Paragraph ${index + 1} processed: ${generatedContent.length} chars`);

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
        console.error(`[chat] Error processing paragraph ${index + 1}:`, error);
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

    console.log(`[chat] Batch completed: ${successCount}/${results.length} successful, total ${totalLength} chars`);

    return NextResponse.json({
      success: true,
      results: results,
      metadata: {
        totalParagraphs: inputParagraphs.length,
        successCount,
        totalContentLength: totalLength,
        model: "gpt-5-mini-2025-08-07"
      }
    });

  } catch (error) {
    console.error('[chat] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      { status: 500 }
    );
  }
}
