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
    const body = (await req.json()) as {
      analysisText?: string;
      pageUrl?: string;
      articleHtml?: string;
      articleText?: string;
    };

    const pageUrlRaw = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : "";
    const analysisText = body?.analysisText ?? "";
    const providedText = typeof body?.articleText === "string" ? body.articleText.trim() : "";
    const providedHtml = typeof body?.articleHtml === "string" ? body.articleHtml : "";

    let articlePlain = providedText || (providedHtml ? toPlainText(providedHtml) : "");
    let captureError: unknown = null;

    if (!articlePlain) {
      if (!pageUrlRaw) {
        return NextResponse.json({ success: false, error: "Missing pageUrl or article content" }, { status: 400 });
      }

      try {
        const { siteCode, resourceId } = deriveSiteCodeAndId(pageUrlRaw);
        const res = await fetch("https://page-lens-zeta.vercel.app/api/proxy/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId, siteCode }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({} as any));
          const article =
            (typeof data?.content?.data?.post_content === "string" ? data.content.data.post_content : undefined) ||
            (typeof data?.data?.post_content === "string" ? data.data.post_content : undefined) ||
            (typeof data?.data?.content === "string" ? data.data.content : undefined) ||
            (typeof data?.content === "string" ? data.content : undefined) ||
            (typeof data?.html === "string" ? data.html : undefined) ||
            (typeof data?.text === "string" ? data.text : undefined) ||
            "";
          articlePlain = toPlainText(article);
        } else {
          captureError = new Error(`Proxy fetch failed: ${res.status}`);
        }
      } catch (err) {
        captureError = err;
      }

      if (!articlePlain && pageUrlRaw) {
        try {
          const direct = await fetch(pageUrlRaw, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)" },
          });
          if (direct.ok) {
            articlePlain = toPlainText(await direct.text());
          } else if (!captureError) {
            captureError = new Error(`Direct fetch failed: ${direct.status}`);
          }
        } catch (err) {
          captureError = captureError || err;
        }
      }
    }

    articlePlain = articlePlain?.slice(0, 8000) ?? "";

    if (!articlePlain) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to retrieve article content",
          detail: captureError instanceof Error ? captureError.message : undefined,
        },
        { status: 502 },
      );
    }

    const prompt = buildContextVectorPrompt(String(analysisText || ""), articlePlain);

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
  return `Developer: ## 角色與目標
你是一位資深 SEO onPage 優化專家，根據提供的分析內容與原文片段，找出最多三項關鍵內容缺口，你將專注在新增段落，並尋找置入位置。
你將提供一整段完整描述，置入文章中任一指定的段落，而非單點的內容改善

Begin with a concise checklist (3-7 bullets) outlining分析輸入、識別內容缺口、逐項建議調整、按影響度排序、格式化為結構化 JSON 輸出等主要步驟。

## 必須輸出的 JSON 結構
{
  "suggestions": [
    {
      "before": "原文片段，至少 20 字",
      "whyProblemNow": "40 字以內的 SEO 問題說明，要淺顯易懂，只專注在內容薄弱上",
      "adjustAsFollows": "說明調整方向／操作重點",
      "afterAdjust": "完整可置入的新段落，至少 20 字，記得換行用 \n，示範要完整"
    },
    ...(最多 3 筆)
  ]
}
若無調整，回傳 {"suggestions": []}。

## 注意
快速總覽清單已經由代碼自動生成，不需要撰寫快速清單
補足弱項內容是重點

## 輸入資料說明
- 參考分析（Markdown）：${analysisText || ""}
- 原文文章片段（純文字，已截斷 8000 字）：${articleText || ""}

## 輸出守則
- 僅填上述欄位，所有字串使用繁體中文，必要換行以 \n 表示。
- whyProblemNow 限 40 字以內；afterAdjust 至少 20 字且必須為可直接放入文章的完整句子或段落。
- 禁止加入 Markdown 表格或 HTML、禁止修改 meta、TOC、快速檢視區塊。
- 建議依 SEO 影響度排序，較嚴重者優先。
- 用字簡潔清晰，字詞概念不重複，高中生程度以下的閱讀難度
- 只提供置入段落建議，需要確認現有段落不足之處，以提供建議。
- 若有多個重複段落，可用某一段落作為修改示範，優先度較低

After each suggestion list is built, quickly 驗證其結構、內容完整度與各欄位長度是否符合規則，若不符則自動修正或剔除不合格項目再輸出。

## Output 格式
- 回傳一個 JSON 物件，包括 "suggestions" 陣列，陣列內每一筆建議物件最多 3 筆（0～3 筆，若無調整則為空陣列）。
- 每筆建議物件需包含：
  - "before"(string)：對應原文片段，必須至少 20 字。
  - "whyProblemNow"(string)：摘要現有 SEO 問題，最多 40 字。
  - "adjustAsFollows"(string)：簡述調整方向或重點。
  - "afterAdjust"(string)：缺少的內容段落，必須至少 20 字，內容至少要回應意圖，並可直接放入原文且無語法錯誤。
- 當 analysisText 或 articleText 任一輸入為空，視同無可調整，回傳 {"suggestions": []}。
- 若內容長度未達最低要求（before/afterAdjust 至少 20 字），可略過該片段，不產生對應建議，亦不需報錯。
`;
}

function normalizeSuggestion(s: ContextVectorSuggestion) {
  const normalizeLabel = (label: string, value: string) =>
    value.startsWith(label) ? value : `${label}${value}`;
  return {
    before: s.before.trim(),
    whyProblemNow: normalizeLabel('', s.whyProblemNow).trim(),
    adjustAsFollows: normalizeLabel('', s.adjustAsFollows).trim(),
    afterAdjust: (typeof s.afterAdjust === 'string' ? s.afterAdjust : '').trim(),
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
