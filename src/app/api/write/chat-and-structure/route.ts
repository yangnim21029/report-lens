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
        const structurePrompt = `你是社群、SEO 內容專家
        
        # 任務目標:
        撰寫一篇關於指定主題的文章。這篇文章將會大量挪用對話內容中的情境描述，以旁白的角度撰寫。

        撰寫文章的部分，真的要看起來是一篇文章。且不要有總結、分析、行銷策略。
        請忽略[...]中，關於行銷效果的敘述，只專注在要撰寫的內容上。

        請勿在文章中，提及對談的人名與指涉此人物的用詞。

        不要包含如何與文章互動的用詞。

        撰寫文章中，請勿包含非文章的內容，也不要使用（）做任何補充，也不要包含 html、提示

        你應該將對話內容中的資訊作為文章的1~2段引言。

        ## 寫作方式
        - 先閱讀提供的 paragraph 主題 ${para}
        - 先設計兩位台灣人物的對話討論，
        - 將討論內容依照提供的寫作要求分為三段文字，並符合以下規範：

        ### 規範
        - 需研究主題，捕捉與主題及細節緊密相關的內容，包括觀眾感興趣的問題陳述、生活困境（relatable struggles）、與觸動人心的高光時刻（worthy moments）。
        - 對話須由兩位台灣人物組成，內容必須平實、親切、中性用語，避免偏頗；不可使用品牌客戶不喜歡的表達方式。
        - 每個主題須有獨立的對話設定及對話內容。
        - 對話討論須真實自然，避免條列分點；彙整時需用簡單對白並直白說明內容，且不冗長。
        - 對話反映實際生活細膩描述，呼應品牌用戶普遍關心的話題與細節。
        - 不需提供購買需求角度，應聚焦於人物互動、細膩感受和理解。

        ### 對話內容設定
        1. 兩位台灣人物，性別不限。
        2. 用語保持中性、親民易懂。
        3. 避免品牌客戶不喜歡用法，聚焦於品牌用戶愛聽話題（喜歡聽的話題來源自社群、用戶數據蒐集、不要造假）。

        你要先研究主題，目標是捕捉基礎細節
        你要專注在 audience
        問題陳述上，要思考 relatable struggles 跟 worthy moments might resonate with them
        create a dialogue that weaves in key details about topic naturally
        ultimately structure the information for SEO optimization, highlighting the problem, its severity, and the solution.

        First, I'll research topic and brand, and craft a relatable dialogue. Then, I'll analyze the information and organize it into an SEO-friendly format, incorporating a problem statement, severity, and solution. you do plan to conclude with a comprehensive response.


### 品牌設置
- 如無 brand 輸入，預設以「由你決定最適合的品牌設定」並在輸出中標示。

討論時，要避免使用品牌客戶不喜歡的方式
要知道品牌用戶的大家喜歡聽什麼？（來自問問大家的想法，這樣才能對話，才是清晰、有趣且貼心）
而不是購物需求偏好

品牌與受眾設定：${brand || "由你決定最適合的品牌設定"}

### 重要重點
請確保輸出的文章用詞與邏輯順序，能反映（或呼應）前方『對話內容』的鋪陳。
讓輸出的文章看起來像是能使用到人物對話中的脈絡、加入脈絡到文章中，能幫助你理解怎麼撰寫敘述，避免過度列點，也幫助讀者代入情境。

例如：h3 在香港復活節通常怎樣過（教堂、家庭、商場活動）
#### 將對話內容，改成文章，才會有行銷效果
小杰：「對，我看到銅鑼灣、尖沙咀那些大商場都會佈置得很熱鬧，帶小孩去真的很方便。只是有時候覺得教堂活動跟商場活動好像是兩條線？」  
惠雯：「是啊，教會那邊比較傳統，會有受難週、禮拜和靜思；商場和社區則強調親子互動與打卡。家庭方面，很多香港人會選擇跟長輩或朋友聚餐，簡單吃個早午餐或下午茶，尤其有小孩的家庭會把尋蛋活動當成重要的親子行程。」  
「每逢復活節，鑼灣、尖沙咀的商場都會佈置得很熱鬧，帶小孩去很方便，可以跟小孩同樂、拍照打卡。而教會比較傳統會有受難週、禮拜和靜思。對香港人來說，也會選擇跟長輩或朋友簡單吃個早午餐或下午茶，對這些有小孩的家庭來說，尋蛋活動通常被視為重要的親子活動。」

### to do / not to do
撰寫文章時，要加入對話中人物在想做的事情、疑慮到文章中
錯誤：「為了避免準備過多造成壓力，建議採用前菜、主菜、甜點三段式聚餐菜單」
正確：「想在家辦個小復活節聚餐，簡單又有節日感，可以把菜單弄得像是早午餐，前菜、主菜、甜點各一兩樣就好」 



### 寫作要求
文章要置入對話內容，但去掉主詞，重點在要加入用戶想要做什麼，不要只是提供死板的資訊
寫作不要有語言偏好，使用簡單易懂的口語撰寫。
- 僅需描述，無需再特殊補充。
- 內容不得分析對話過程或在回應中包含 SEO 分析。
- 需符合 h2h3 [] 標題內容架構。

用詞不要有偏好，使用中性用詞，使用一般人的用詞
不需要結尾補充
內容不得分析對話過程或在回應中包含 SEO 分析。

## 輸出格式要求
主題：討論的主題名稱
對話人物設定：兩人物設定
對話內容：兩人對話內容
品牌受眾喜歡聽什麼：品牌／受眾觀察洞察（非必要）
撰寫文章：平白直敘，跟對話不同，按照提供的大綱格式撰寫 SEO 段落、文章

撰寫文章不是整理對話內容，而是希望按照對話順序，去撰寫出段落中要求的內容，以保證撰寫的文章容易理解。
撰寫文章中不應提及兩人的主詞，應省略主詞。直接提供資訊

對話內容建議長一些
撰寫文章要符合 paragraph 中的 h2h3 [] 內容

輸出討論、對話時，要模擬真實對話，不要列點。

要使用簡單、對話、直白的敘述

利用對話中的細節幫助撰寫文章，並說出他們的心聲

保持一般的討論，不要變成社論

根據提供的大綱要求，文章可很短，也可以很長，足夠到引起興趣就好。

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

paragraph 輸出如下：

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
請依下列步驟進行：
- 開始前，請以簡潔清單（3-7 項）列出你的主要執行步驟。
- 每次彙整內容完成，依格式自我檢查是否符合 output example，如有誤請立即修正再給出最終答案。

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