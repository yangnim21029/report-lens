import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const ContextVectorSuggestionSchema = z.object({
  before: z.string().min(20),
  whyProblemNow: z.string().min(1).max(40),
  adjustAsFollows: z.string().min(1).max(40),
  afterAdjust: z.string().min(40),
});

const ContextVectorResponseSchema = z.object({
  suggestions: z.array(ContextVectorSuggestionSchema),
});

export type ContextVectorSuggestion = z.infer<typeof ContextVectorSuggestionSchema>;

export async function POST(req: Request) {
  try {
    const { analysisText, pageUrl } = await req.json();
    if (!pageUrl) return NextResponse.json({ success: false, error: "Missing pageUrl" }, { status: 400 });

    const { siteCode, resourceId } = deriveSiteCodeAndId(pageUrl);
    const res = await fetch("https://page-lens-zeta.vercel.app/api/proxy/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, siteCode }),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Proxy fetch failed: ${res.status}` }, { status: 502 });
    }
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

    const response = await openai.responses.parse({
      model: "ggpt-5-mini-2025-08-07",
      input: [
        { role: "system", content: "你是資深 SEO 策略師，輸出必須符合指定 JSON 結構。" },
        { role: "user", content: prompt },
      ],
      text: {
        format: zodTextFormat(ContextVectorResponseSchema, "context_vector"),
      },
    });

    const parsed = response.output_parsed;
    const suggestions = (parsed?.suggestions ?? []).map(normalizeSuggestion);
    const markdown = buildMarkdownTable(suggestions);

    return NextResponse.json({ success: true, suggestions, markdown }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
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
  return `Developer: ### Role and Objective
Identify the two or three highest-impact content gaps in a given article and provide specific adjustments to address them.

### Instructions
- Analyze the provided reference analysis (Markdown) and the original article excerpt (plain text).
- Clearly identify up to three content gaps with the greatest SEO impact, ordered by priority.
- For each gap, explicitly state the SEO problem and recommend a precise adjustment.
- If no adjustments are needed, return {"suggestions": []}.

### Output Format
Return a JSON object that strictly matches this schema:
{
  "suggestions": [
    {
      "before": "原文片段，必須為原文內容且不少於 20 字",
      "whyProblemNow": "明確說明 SEO 缺口，40 字以內，精簡陳述",
      "adjustAsFollows": "建議的行動指令或修改建議，使用傳統中文，簡明扼要",
      "afterAdjust": "調整後可直接放入文章的語句，不少於 20 字"
    },
    // 2 至 3 個建議，皆需符合上述規則
  ]
}
- suggestions 陣列必須依 SEO 影響排序（影響度高者優先），如影響相同則以發現順序排列。
- 所有字串欄位必須使用繁體中文且為單行（如需換行則以 \n ）。請勿使用 Markdown 表格或 HTML 標記。
- 若 analysisText 或 articleText 欄位缺失或為空，請回傳 {"error": "缺少必要輸入，無法執行分析。"}

### Don't do
- 請勿修改 meta 標籤、快速瀏覽區塊或目錄。
- 每條建議必須明確解釋 SEO 缺口及提出精準的調整方式。

### Context
- 輸入：
  - Reference analysis (Markdown)：${analysisText || ""}
  - Original article (plain text excerpt)：${articleText || ""}

### Planning
- 請於內部思考時，逐步檢查分析及原文內容，找出最大影響的缺口。
- 驗證每條建議是否有充分理由及明確調整方案。

### Post-action Validation
- 在提出調整建議後，簡要驗證各項調整是否能實際提升內容的 SEO 影響力。
- 若發現結果有疑慮，優先再精煉建議並重新確認。

### Verbosity
- 回傳內容應精煉明確，避免冗長解釋。

### Stop Conditions
- 當所有高影響 SEO 缺口及精準建議均已提出，或無需調整時結束。
`;
}

function normalizeSuggestion(s: ContextVectorSuggestion) {
  const normalizeLabel = (label: string, value: string) =>
    value.startsWith(label) ? value : `${label}${value}`;
  return {
    before: s.before.trim(),
    whyProblemNow: normalizeLabel('', s.whyProblemNow).trim(),
    adjustAsFollows: normalizeLabel('', s.adjustAsFollows).trim(),
    afterAdjust: s.afterAdjust.trim(),
  } satisfies ContextVectorSuggestion;
}

function buildMarkdownTable(suggestions: ContextVectorSuggestion[]): string {
  if (!suggestions.length) {
    return "| 原文片段 | 建議調整 |\n|:---|:---|\n| 目前無需調整 | — |";
  }
  const header = "| 原文片段 | 建議調整 |";
  const divider = "|:---|:---|";
  const rows = suggestions.map((item) => {
    const left = escapePipes(item.before);
    const right = escapePipes(`${item.whyProblemNow}\n${item.adjustAsFollows}\n${item.afterAdjust}`.trim());
    return `| ${left} | ${right} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}
