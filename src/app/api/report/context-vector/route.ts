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
  return `## Inputs
- Reference analysis (markdown)\n${analysisText || ""}
- Original article (plain text excerpt)\n${articleText || ""}

## Task
Identify the two or three highest impact content gaps and propose adjustments.

## Output format (MUST FOLLOW)
Return JSON matching the provided schema. Use Traditional Chinese for textual fields. Each suggestion must include:
- before: 原文片段 (>= 20 chars)
- whyProblemNow: 明確說明 SEO 缺口，40 字以內
- adjustAsFollows: 描述建議的行動指令（文字即可）
- afterAdjust: 調整後可直接放入文章的語句 (>= 20 chars)
If no adjustments are needed, return {"suggestions": []}.

## Guardrails
- Do not modify meta tags, fast-view blocks, or the table of contents.
- Each suggestion must explicitly explain the SEO gap and give a precise adjustment.
- Keep strings single-line (use \n for breaks); avoid Markdown tables or HTML tags.
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
