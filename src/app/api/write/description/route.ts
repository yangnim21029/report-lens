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

h2 [標題文字]
演算法綁架指數：[總分]/50
- Knowledge Graph 清晰度: X/10
- 用詞混淆度（反向）: X/10
- 搜尋意圖明確度: X/10
- 句型結構簡單度: X/10
- 可結構化程度: X/10

[撰寫建議：
根據綁架指數給予建議：

【高綁架指數 35-50 分】= 容易做 SEO
建議：內容已經很適合 SEO，專注在：
- 具體執行方式（如何用表格、列表呈現）
- 關鍵字自然融入技巧
- Featured Snippet 優化

【中綁架指數 20-34 分】= 需要優化
建議：提供具體優化方向：
- 如何讓實體關係更清楚
- 如何簡化用詞
- 如何明確搜尋意圖
- 如何調整句型結構

【低綁架指數 1-19 分】= 難做 SEO
建議：需要大幅調整：
- 重新定義標題，讓實體明確
- 改用搜尋引擎友善的用詞
- 明確單一搜尋意圖
- 簡化句型
- 考慮是否適合做 SEO，或改用其他內容策略
]

# 範例

h2 2025 蛇年送長輩四字祝福語 50 句
演算法綁架指數：42/50
- Knowledge Graph 清晰度: 9/10（年份-節慶-對象-格式-數量都明確）
- 用詞混淆度（反向）: 8/10（用詞精確，「四字祝福語」無歧義）
- 搜尋意圖明確度: 9/10（明確要找祝福語列表）
- 句型結構簡單度: 8/10（簡單名詞組合）
- 可結構化程度: 8/10（完美適合列表呈現）

撰寫建議：
此標題演算法綁架指數高，非常適合 SEO。建議：
1. 使用編號列表呈現 50 句祝福語
2. 每句加上使用場景說明（如：拜訪時、電話中、訊息裡）
3. 用表格呈現「祝福語-拼音-使用場景」三欄
4. 在開頭用 2-3 句話總結「為什麼要送四字祝福語」
5. 爭取 Featured Snippet：用「最適合送長輩的四字祝福語包括：」開頭

---

h3 探索祝福語背後的文化意涵
演算法綁架指數：15/50
- Knowledge Graph 清晰度: 2/10（「探索」「背後」「意涵」都很抽象）
- 用詞混淆度（反向）: 3/10（「意涵」可能指很多東西）
- 搜尋意圖明確度: 3/10（不確定要找什麼答案）
- 句型結構簡單度: 4/10（文學性表達）
- 可結構化程度: 3/10（需要敘事性內容）

撰寫建議：
此標題演算法綁架指數低，難做 SEO。建議大幅調整：
1. 改標題為「四字祝福語的由來與意義」（實體明確）
2. 或改為「常見四字祝福語解釋」（搜尋意圖清楚）
3. 用表格呈現「祝福語-字面意思-文化由來」
4. 避免「探索」「背後」等抽象詞
5. 如果堅持原標題，考慮這段內容不以 SEO 為主要目標，改用社群媒體或內容行銷策略

# 大綱內容
${outline}

# 重要提醒
- 高分 = 被演算法綁架 = 容易做 SEO（但可能犧牲創意）
- 低分 = 不被演算法綁架 = 難做 SEO（但可能更有創意）
- 不要有語言/地區偏好
- 建議要具體可執行
- 保持原本的 h2/h3 結構
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
