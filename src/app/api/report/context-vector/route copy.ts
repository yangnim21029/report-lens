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
  return `You are an expert SEO Content Strategist and Copywriter specializing in analyzing user intent and optimizing content for search engine performance. 
  Your goal is to design a seo content update that attracts targeted search traffic and fits seamlessly into existing articles.

  **Task Overview**

Input:
- ${analysisText}

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
| Before Adjustment (string) | After Adjustment |
|:---|:---|
- **Before Adjustment**: An excerpt from the article needing improvement.
- **After Adjustment**: Briefly describe the Why problem now, offer a specific, keyword-focused revision (no HTML). 

Do not include other suggestion from analysis.
Answer why problem now directly
Give Adjust as follows directly.
Only Two items should in cols two cells :Why problem now and Adjust as follows, do not add anything else, it can short. just keep it.
**Do not add any unassign paragraph**
Use two <br><br> for newline to read in a cell.
Do not use ** in cell.
Do not change H1, Toc, meta tag, fast view
Article already have fast view part
focus on Weak content
Why problem now state should clear SEO problem, rationale in short for high school student to understand.

After Adjustment should start from "Why problem now:"

**Example:**
| Before Adjustment | After Adjustment |
|:---|:---|
| Switch Animal Crossing has been extremely popular since its launch. ... | Why problem now: The content do not response search intent. <br> Adjust as follows: <br> ...(example) |


**Additional Output Requirements:**
- Match regional language and article style.
- Focus only on accurate, SEO-driven content enhancements; do not optimize for general readability or structure.
- Do not change the table columns or structure.

# Notice
alias may be input error, should ignore user input error.
`
}
