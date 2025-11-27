import { NextResponse } from "next/server";
import { getVertexTextModel } from "~/server/vertex/client";

export const runtime = "nodejs";

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

    const descriptionPrompt = `你是資深的 SEO 內容策略專家，專門分析內容「被演算法綁架」的程度。

# 核心概念：演算法綁架指數
「演算法綁架」指的是內容為了迎合搜尋引擎演算法而犧牲自然表達的程度。
分數越高 = 越容易被搜尋引擎理解 = 越被演算法綁架 = SEO 越容易做

# 分析目標
${analyseResult}

# 評分維度（每項 1-10 分，10 分 = 完全被綁架 = 最容易做 SEO）

## 1. Knowledge Graph 清晰度 (1-10)
- 10分：實體關係明確，如「iPhone 15 Pro Max 價格」（品牌-產品-型號-屬性）
- 7-9分：實體清楚但關係需推斷，如「最新 iPhone 多少錢」
- 4-6分：實體模糊，如「新手機推薦」
- 1-3分：實體不明，如「這個怎麼樣」

評估：標題中的實體（人、事、物、地點、時間）是否明確？關係是否清楚？

## 2. 用詞混淆度 (1-10，反向計分)
- 10分：用詞精確無歧義，如「2025 年報稅截止日期」
- 7-9分：用詞清楚但有些通用，如「報稅期限」
- 4-6分：用詞可能混淆，如「稅務處理」
- 1-3分：用詞模糊多義，如「處理那個」

評估：用詞是否有多重意義？是否容易與其他概念混淆？

## 3. 搜尋意圖明確度 (1-10)
- 10分：意圖單一明確，如「如何申請護照」（How-to）
- 7-9分：意圖清楚但可能有變化，如「護照申請」
- 4-6分：意圖不明確，如「護照相關」
- 1-3分：意圖模糊，如「出國準備」

評估：使用者搜尋這個詞時，想要什麼答案？是否只有一種答案？

## 4. 句型結構簡單度 (1-10)
- 10分：結構極簡，如「台北天氣」「iPhone 價格」
- 7-9分：簡單疑問句，如「如何煮飯」「哪裡買」
- 4-6分：複雜句型，如「想知道如果要...應該怎麼...」
- 1-3分：複雜或文學性表達，如「探索...的奧秘」

評估：句型是否符合搜尋引擎常見的查詢模式？

## 5. 可結構化程度 (1-10)
- 10分：完美適合結構化，如「步驟」「比較」「列表」
- 7-9分：容易結構化，如「原因」「方法」
- 4-6分：需要敘事，如「經驗分享」
- 1-3分：難以結構化，如「感想」「心得」

評估：內容是否容易用表格、列表、步驟等結構呈現？

# 輸出格式

對每個 h2/h3 標題，只輸出：

h2 [標題文字]
[具體撰寫指示：這段內容要做什麼、要加什麼內容，才能提高演算法綁架指數]

h3 [標題文字]
[具體撰寫指示：這段內容要做什麼、要加什麼內容，才能提高演算法綁架指數]

# 撰寫指示範例

好的指示（具體、可執行）：
[用編號列表呈現 50 句四字祝福語，每句後面加上「適用場景」（如：拜訪長輩時、電話拜年、LINE 訊息）。開頭用一段話說明「為什麼四字祝福語適合送長輩」（簡潔、吉祥、好記）。用表格整理「祝福語-拼音-使用時機」三欄，方便讀者快速查找。]

[列出 10-15 個常見四字祝福語，用表格呈現「祝福語-字面意思-文化由來-現代用法」四欄。每個祝福語用 2-3 句話解釋，避免長篇大論。加入「哪些場合最適合用這句」的實用建議。]

不好的指示（空泛、不具體）：
[寫一些祝福語]
[介紹文化背景]
[說明意義]

# 撰寫指示原則

1. 明確指出「用什麼格式」（列表、表格、步驟、比較）
2. 說明「要包含什麼資訊」（數量、場景、解釋、範例）
3. 指出「如何組織內容」（開頭說什麼、主體怎麼排、要不要分類）
4. 提供「具體數字」（幾句話、幾個項目、幾欄表格）
5. 說明「為什麼這樣寫」（讓實體更清楚、讓意圖更明確、讓結構更簡單）

# 根據演算法綁架指數調整指示

內部評估（不輸出）：
- 高綁架指數 35-50 分：給執行細節（用什麼格式、加什麼內容）
- 中綁架指數 20-34 分：給優化方向（如何讓實體更清楚、如何簡化）
- 低綁架指數 1-19 分：給大幅調整建議（改標題、改結構、或放棄 SEO）

但輸出時，不要寫出評分，只寫具體的撰寫指示。

# 範例輸出

h2 2025 蛇年送長輩四字祝福語 50 句
[用編號列表呈現 50 句四字祝福語，每句後面標註「適用場景」（拜訪時/電話中/訊息裡）。開頭用 2-3 句話說明「為什麼四字祝福語適合送長輩」（簡潔吉祥、容易記憶、傳統得體）。用表格整理前 20 句熱門祝福語，包含「祝福語-注音-使用時機-範例對話」四欄。在列表前加上「最適合送長輩的四字祝福語包括：」這句話，爭取 Featured Snippet。]

h3 四字祝福語的由來與意義
[用表格呈現 10-15 個常見四字祝福語，包含「祝福語-字面意思-歷史由來-現代用法」四欄。每個祝福語的解釋控制在 2-3 句話，重點說明「為什麼這個詞吉祥」和「什麼場合最適合用」。開頭用一段話（3-4 句）總結「四字祝福語在華人文化中的地位」。避免長篇敘事，用條列式呈現重點。]

h3 如何挑選適合長輩的祝福語
[用步驟式呈現挑選方法：1) 考慮長輩年齡和健康狀況 2) 選擇正面吉祥的詞彙 3) 避免諧音不好的字 4) 配合節慶選用。每個步驟下方列出 3-5 個具體範例和說明。用表格比較「適合」vs「不適合」的祝福語，說明原因。加入「快速挑選指南」：健康類、財運類、平安類、長壽類四大分類，每類列出 5 句推薦。]

# 大綱內容
${outline}

# 重要提醒
- 高分 = 被演算法綁架 = 容易做 SEO（但可能犧牲創意）
- 低分 = 不被演算法綁架 = 難做 SEO（但可能更有創意）
- 不要有語言/地區偏好
- 建議要具體可執行
- 保持原本的 h2/h3 結構
`;

    const model = getVertexTextModel();
    const resp = await model.generateContent(descriptionPrompt);
    const generatedContent =
      resp.response?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() || "";

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
