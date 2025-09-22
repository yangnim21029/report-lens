import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Direct implementation of context vector generation (remove tRPC dependency)
export async function POST(req: Request) {
  try {
    const { analysisText, pageUrl } = await req.json();
    if (!pageUrl) return NextResponse.json({ success: false, error: "Missing pageUrl" }, { status: 400 });

    const { siteCode, resourceId } = deriveSiteCodeAndId(pageUrl);
    // Fetch original content from page-lens proxy
    const res = await fetch("https://page-lens-zeta.vercel.app/api/proxy/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, siteCode }),
    });
    if (!res.ok) return NextResponse.json({ success: false, error: `Proxy fetch failed: ${res.status}` }, { status: 502 });
    const data = await res.json().catch(() => ({} as any));

    const article: string =
      (typeof data?.content?.data?.post_content === "string" ? data.content.data.post_content : undefined) ||
      (typeof data?.data?.post_content === "string" ? data.data.post_content : undefined) ||
      (typeof data?.data?.content === "string" ? data.data.content : undefined) ||
      (typeof data?.content === "string" ? data.content : undefined) ||
      (typeof data?.html === "string" ? data.html : undefined) ||
      (typeof data?.text === "string" ? data.text : undefined) ||
      "";

    const prompt = buildContextVectorPrompt(String(analysisText || ""), toPlainText(article).slice(0, 8000));

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        { role: "system", content: "你是資深內容編輯與 SEO 策略顧問，輸出使用繁體中文，提供可直接置入原文的一段 context vector 建議，清楚標註放置位置與理由。" },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ success: true, content }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

function deriveSiteCodeAndId(pageUrl: string) {
  const u = new URL(pageUrl);
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.toLowerCase();
  const fixed: Record<string, string> = {
    "pretty.presslogic.com": "GS_HK",
    "girlstyle.com": "GS_TW",
    "urbanlifehk.com": "UL_HK",
    "poplady-mag.com": "POP_HK",
    "topbeautyhk.com": "TOP_HK",
    "thekdaily.com": "KD_HK",
    "businessfocus.io": "BF_HK",
    "mamidaily.com": "MD_HK",
    "thepetcity.co": "PET_HK",
  };
  let siteCode: string | undefined;
  if (host === "holidaysmart.io") siteCode = path.includes("/tw/") ? "HS_TW" : "HS_HK";
  else siteCode = fixed[host];
  if (!siteCode) throw new Error(`Unknown site: ${host}`);
  const m = u.pathname.match(/\/article\/(\d+)/i);
  const resourceId = m?.[1] || "";
  if (!resourceId) throw new Error(`Cannot parse resourceId from path: ${u.pathname}`);
  return { siteCode, resourceId };
}

function toPlainText(html: string) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


function buildContextVectorPrompt(analysisText: string, articleText: string) {
  return `You are an expert SEO Content Strategist and Copywriter specializing in analyzing user intent and optimizing content for search engine performance. Your goal is to design a strategic content update that attracts targeted search traffic and fits seamlessly into existing articles.
Begin with a concise checklist (3-7 bullets) outlining the main workflow steps before substantive work.
**Task Overview**
Input:
- ${analysisText}: Analysis of the topic or user intent.
- ${articleText}: The original article content.
- Desired tone, core question, and a list of key data points.
Objective:
- Write a content block that concisely and authoritatively answers the core question, delivers high SEO impact within the opening sentences, and integrates with the current article.

**Workflow**
1. **Strategy Analysis**
- Evaluate the user request to clarify the objective.
- Conduct SEO research: assess search intent, review competitive articles, and identify the core question.
2. **Framework Creation**
- Translate insights into actionable content standards and a checklist.
- Build a template specifying: Paragraph Type, Modification Location, Content Suggestions (additions/adjustments), and all required data points (input as a comma-separated list).
3. **Content Drafting**
- Create the initial concise, information-rich draft.
- Use the designated tone and include mandatory key data points.
- Apply an SEO-forward strategy—core keywords and information must appear at the beginning.
4. **Optimization & Refinement**
- Refine draft for completeness and brevity based on feedback.
- Maximize impact of opening sentences.
- Ensure easy integration into the existing article without disrupting flow.
After each substantive adjustment, validate your changes in 1-2 sentences, ensuring SEO improvements align with objectives. If the validation fails or input requirements are unmet, self-correct or request clarification before proceeding.
*Maintain regional language and tone matching the input.*
**Restrictions**
- Do not produce a full-length article—only a single, compact paragraph.
- Avoid vague or generic content.
- Present critical information at the start—do not bury it within the text.
- Adhere strictly to the requested tone.
- Ensure content aligns stylistically with the existing article—no disjointed insertions.
---
**Optimization Demonstration**
Complete two to three targeted optimizations:
- Do not create a new article, but enhance context by inserting more keywords and boosting the reading experience.
- For each, specify: original paragraph type, article type, and the recommended addition (before, after, or within original content).
---
**Original Article Content**
${articleText || "Article text not provided. Please supply 'articleText'} ."}
## NOTICE
If you use headings (##, ###), ensure the language is simple enough for a high school student.

## Output Format
Return all optimizations in "Only Markdown table" using the schema below:
| Before Adjustment (string) | Modification Suggestion (includes clear SEO problem, rationale, actionable adjustment) | Keywords (comma-separated) |
|:-------------------------|:-----------------------------------------------------------------------------------------|:--------------------------|
- **Before Adjustment**: An excerpt from the article needing improvement.
- **Modification Suggestion**: Briefly describe the SEO concern, offer a specific, keyword-focused revision (no HTML). Conclude with hashtagged keywords.
- **Keywords**: List of relevant keywords, comma-separated.

Do not include other suggestion from analysis.

Use <br> for newline to read in a cell.
Do not use ** in cell.

**Example:**
| Before Adjustment | Modification Suggestion | Keywords |
|:---|:---|:---|
| Switch Animal Crossing has been extremely popular since its launch. ... | Current Situation: The introduction lacks notable villager details. <br> Adjust as follows: <br> Among the SS-tier villagers, Raymond the cat stands out for his unique features and popularity in Animal Crossing communities. | AnimalCrossingVillagerGuide2025 |

**Additional Output Requirements:**
- Match regional language and article style.
- Focus only on accurate, SEO-driven content enhancements; do not optimize for general readability or structure.
- Do not change the table columns or structure.
- Always ensure all required input fields (analysisText, articleText, tone, core question, key data points) are provided. If any are missing, return a clear error specifying the missing field(s).

# Notice
alias may be input error, should ignore user input error.
`
}

// function buildContextVectorPromptZh(analysisText: string, articleText: string) {
//   return `你是一位專業的 SEO 內容策略師與文案寫手。你的專長是分析使用者意圖與搜尋引擎策略，以創造出精準、簡潔且高影響力的內容。你的任務不僅是撰寫文字，更是要設計一個能夠「劫持」目標搜尋流量、並與現有文章無縫整合的內容解決方案。

// Task

// ${analysisText || "分析結果：N/A"}

// （AI 參考上述分析，執行以下任務）

// 你的核心任務是為一個 [請填寫主題/對象，例如：產品、人物、概念] 撰寫一個全面而簡潔的 [請填寫內容區塊名稱，例如：快速檔案、核心摘要]。這個段落必須能立即且權威地回答使用者最核心的問題 [請填寫核心問題，例如：「[主題]是什麼？」]，並在文章開頭幾句話內就發揮最大的 SEO 效益。最終成品需具備資訊密度高、語氣溫暖在地化、且能無縫嵌入現有文章的特點。

// To Do
// 策略分析：
// 剖析使用者請求，識別出最根本的目標。
// 進行 SEO 分析，理解目標受眾的搜尋意圖與現有成功範例的策略。
// 確定內容需要「預先回答」的核心問題：[此處代入上述核心問題]。

// 框架建立：
// 將 SEO 分析結果轉化為具體的內容標準與檢核清單。
// 建立一個結構化模板，包含：段落類型、修改位置、建議內容（新增與調整）。
// 整合所有必要的關鍵資料點：[請列出所有必須包含的關鍵資料點，用逗號分隔]。

// 內容撰寫：
// 撰寫初稿，確保文字簡潔、吸引人，並整合所有關鍵資料點。
// 採用 [請填寫期望的語氣，例如：溫暖在地化、專業權威] 的語氣。
// 運用「SEO 劫持」策略，將最重要的關鍵字與核心資訊放在段落的最前端。

// 優化修飾：
// 根據回饋進行精修，確保內容全面而簡潔。
// 重新檢視開頭的幾句話，最大化其關聯性與影響力。
// 確保最終段落能與現有文章無縫整合，提升整體閱讀體驗。

// to Do:
// 使用與原文一樣地區的語言

// Not to Do
// 避免冗長： 不要寫成一篇完整的說明文，專注於一個精簡的段落。
// 避免模糊： 不要使用模糊或空泛的描述，必須提供具體、有價值的資訊。
// 避免資訊後置： 不要將最重要的核心資訊埋在段落深處。
// 避免語氣不符： 不要使用與指示不符的語氣。
// 避免內容脫節： 產出的段落不能感覺像外來物，必須與文章的其餘部分風格一致。


// -----

// 請依下列要求示範2~3種優化，因為不能新增新的完整文章，但我希望能包含更多關鍵字，請幫我示範增加 context vector 的段落內容，覆蓋關鍵字同時，也讓閱讀體驗更好（列出原文的段落類型，以及文章類型，以及該類型前/後/現有內容中，可以置入的一段內容）。

// 重點：這次優化，不能新增新的一篇文章，但又要能包含更多關鍵字

// -----

// 以下是原文：
// ${articleText}


// ## Notice
// 注意若使用 h2 h3 如 ##, ### 時，文字要簡單到高中生看懂的程度。

// ## output format
// 請輸出 table 格式，col1調整前，col2修改建議，col2 中，最後用 tag 標註對應關鍵字詞，好讓編輯去執行
// col2 修改建議的寫法旨在回答：
// 1. 現況為什麼是問題？
// 2. 調整什麼就好了？
// （修改示範不需包含 html, 問題陳述需簡潔清晰，問題陳述需定義其 SEO 常識出問題，而非閱讀問題）

// 示範：
// 調整前內容｜修改建議｜關鍵字詞
// Switch《動物之森/動物森友會》推出以嚟極受歡迎，除咗建設專屬無人島之外，仲有可愛嘅動物島民都係其中一個受歡迎因素！有日本網站gamepedia舉辦動森人氣島民投票，將391位島民分成SS至D，6個等級。｜現況：... 調整如下：傑克 在SS級的頂尖人氣島民中，貓咪種族的**傑克(Raymond)**是極具代表性的一位。他最顯著的特徵，就是那對獨特的異色瞳以及一身筆挺的西裝，這些外觀完美襯托出他彬彬有禮的自戀型性格。這位在10月1日出生的島民，時常把口頭禪「呀是喔」掛在嘴邊，記憶點十足。綜合以上所有特質，使傑克成為眾多玩家心目中，最想邀請上島的夢幻名單之一。 #動森島民圖鑑2025


// ## do
// 維持相同的語氣

// ## Don't do
// 不要提供流暢度的優化，專注在提供準確的缺失/補足內容。
// 不要自己添加欄位



// `;
// }
