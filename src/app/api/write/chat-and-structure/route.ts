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

你的輸出
主題：  
對話人物設定：
對話內容：
品牌受眾研究：
對話內容整理：

----
示範輸入＆輸出：

輸入：

• 吉伊（Chiikawa / 吉伊卡哇）
- 一行總結（Who / 角色定位）

[用一句話精準定義主角 Chiikawa 的核心身份與性格，例如「故事主角，一個愛哭但內心善良，努力生活的小生物」，快速滿足使用者對「Chiikawa是誰」的好奇心，並在摘要中突出角色核心。]
- 中文、日文、羅馬拼音對照
[在此獨立小節再次列出該角色的所有名稱變體，是為了強化此頁面與「吉伊卡哇 介紹」、「chiikawa 主角」等特定角色搜尋的高度相關性，鞏固關鍵字密度。]

- 性格與代表行為
[透過點列式（bullet points）詳細描述角色的性格特徵（如：愛哭、善良、會拔草）與經典行為，回應更深入的「Chiikawa 性格」或「吉伊 特點」等描述型搜尋，增加內容深度。]

- 代表場景 / 小故事
[簡述一至兩個該角色的經典網路迷因（Meme）或漫畫情節（如：拔草檢定、考取證照），能豐富內容的語義詞彙（LSI Keywords），有效提升使用者在頁面的停留時間，展示頁面的權威性。]

- 推薦圖片與 alt 文本
[策略性地插入一張高品質官方角色圖片，並在其 alt 文本中精準填寫如「Chiikawa 角色介紹 - 吉伊卡哇（吉伊）哭泣拔草圖」等描述，旨在爭取 Google 圖片搜尋的排名，帶來額外流量。]

輸出如下：

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

對話內容整理：
問題陳述

許多人對《吉伊卡哇》的主角「吉伊」的第一印象，僅僅是「一隻很可愛、但一直在哭的白色生物」，不明白為何這樣一個看似軟弱、做事常失敗的角色，能夠獲得如此超高的人氣與粉絲的深刻情感連結。

嚴重性

如果只將吉伊視為一個單純的「愛哭鬼」，你將會錯過這個角色最核心的魅力：那份在逆境中依然保持善良與努力的珍貴品質。這不僅會讓你無法真正理解粉絲們為何對牠感到心疼與喜愛，也會讓你錯過從這個角色身上獲得的療癒與力量。

解決方案

深入了解吉伊的性格特質與代表性故事，你會發現牠的魅力遠不止於可愛。

一行總結（Who / 角色定位）
故事的主角，一個非常愛哭、膽小，但內心無比善良且努力想靠自己力量生活的小生物。

中文、日文、羅馬拼音對照

日文：ちいかわ

羅馬拼音：Chiikawa

中文：吉伊 / 小可愛

性格與代表行為

愛哭：情感豐富且敏感，遇到困難、恐懼或感動時都會哭。

善良溫柔：會把朋友的需求默默記在心裡，願意為朋友付出。

努力家：儘管常常失敗，但為了生活與朋友，仍會鼓起勇氣去工作（如拔草、討伐）。

膽小：戰鬥能力很弱，面對強敵時會害怕發抖，但不會拋下朋友。

代表場景 / 小故事
最經典的故事之一是「挑戰拔草檢定」。吉伊為了考取5級證照以獲得更穩定的收入，非常認真地練習。然而在考試當天，牠因為過度緊張和壓力，最終失敗了。故事中，牠獨自躲在角落傷心哭泣的畫面，深刻描繪了「努力未必有回報」的現實感，引發了大量讀者的共鳴與心疼。

推薦圖片與 alt 文本

推薦圖片：選擇一張官方圖片，內容是吉伊拿著拔草工具，一邊流淚一邊奮力拔草的樣子。

alt 文本：Chiikawa 角色介紹 - 吉伊（ちいかわ）在拔草檢定中努力又哭泣的經典畫面

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