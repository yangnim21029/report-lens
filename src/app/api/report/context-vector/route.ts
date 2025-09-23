import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const ContextVectorSuggestionSchema = z.object({
  before: z.string().min(20),
  whyProblemNow: z.string().min(1).max(80),
  adjustAsFollows: z.string().min(1),
  afterAdjust: z.union([z.string().min(20), z.null()]).optional().default(null),
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
      model: "gpt-5-mini-2025-08-07",
      input: [
        { role: "system", content: "你是資深 SEO 策略師，輸出必須符合指定 JSON 結構。" },
        { role: "user", content: prompt },
      ],
      text: {
        format: zodTextFormat(ContextVectorResponseSchema, "context_vector"),
      },
    }).catch((err) => {
      console.warn("[context-vector] parse error", err);
      return null;
    });

    const parsed = response?.output_parsed ?? { suggestions: [] };
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
  return `## Role & Objective
你是一位資深 SEO 策略師，需根據提供的分析與原文片段，找出最多三項關鍵內容缺口並給出可直接落地的調整。

## 必須輸出的 JSON 結構
{
  "suggestions": [
    {
      "before": "原文片段，至少 20 字",
      "whyProblemNow": "40 字以內的 SEO 問題說明(seo concern)",
      "adjustAsFollows": "說明調整方向／操作重點",
      "afterAdjust": "完整可直接置換的更新內容，至少 20 字"
    }
  ]
}
若無調整，回傳 {"suggestions": []}。

## 輸入資料
- Reference analysis (Markdown)：${analysisText || ""}
- Original article excerpt (純文字，已截斷 8000 字)：${articleText || ""}

## 輸出守則
- 只填入上述欄位，所有字串使用繁體中文，必要換行用 \\n 表示。
- whyProblemNow 限 40 字內；afterAdjust 至少 20 字，必須是可直接放入文章的完整句子或段落。
- 禁止加入 Markdown 表格或 HTML、禁止修改 meta、TOC、快速檢視區塊。
- 建議依 SEO 影響度排序，高者優先。
`;
}

function normalizeSuggestion(s: ContextVectorSuggestion) {
  const normalizeLabel = (label: string, value: string) =>
    value.startsWith(label) ? value : `${label}${value}`;
  const rawAfter = typeof s.afterAdjust === 'string' ? s.afterAdjust : null;
  const after = rawAfter && rawAfter.trim().length >= 20
    ? rawAfter.trim()
    : s.adjustAsFollows.trim();
  return {
    before: s.before.trim(),
    whyProblemNow: normalizeLabel('', s.whyProblemNow).trim(),
    adjustAsFollows: normalizeLabel('', s.adjustAsFollows).trim(),
    afterAdjust: after,
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
    const after = item.afterAdjust || item.adjustAsFollows;
    const right = escapePipes(`${item.whyProblemNow}\n${item.adjustAsFollows}\n${after}`.trim());
    return `| ${left} | ${right} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}
