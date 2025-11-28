import { NextResponse } from "next/server";
import { getVertexTextModel } from "~/server/vertex/client";
import { SchemaType } from "@google-cloud/vertexai";
import { buildContextVectorPrompt } from "./prompt";

export const runtime = "nodejs";

type ContextVectorSuggestion = {
  before: string;
  whyProblemNow: string;
  adjustAsFollows: string;
  afterAdjust?: string | null;
};

const contextVectorResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    suggestions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          before: {
            type: SchemaType.STRING,
            description: "Exact unique string from the Article Content (at least 10 chars)",
          },
          whyProblemNow: {
            type: SchemaType.STRING,
            description: "Brief explanation why this spot needs content (max 80 chars)",
          },
          adjustAsFollows: {
            type: SchemaType.STRING,
            description: "Instruction on what to add",
          },
          afterAdjust: {
            type: SchemaType.STRING,
            description: "The complete new paragraph to insert",
            nullable: true,
          },
        },
        required: ["before", "whyProblemNow", "adjustAsFollows"],
      },
    },
  },
  required: ["suggestions"],
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      analysisText?: string;
      pageUrl?: string;
      articleHtml?: string;
      articleText?: string;
    };
    const debugId = Math.random().toString(36).slice(2, 8);

    const pageUrlRaw = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : "";
    const analysisText = body?.analysisText ?? "";
    const providedText = typeof body?.articleText === "string" ? body.articleText.trim() : "";
    const providedHtml = typeof body?.articleHtml === "string" ? body.articleHtml : "";

    if (!analysisText || !analysisText.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing analysisText" },
        { status: 400 },
      );
    }

    console.log("[context-vector][%s] incoming", debugId, {
      hasAnalysis: !!analysisText,
      pageUrl: pageUrlRaw || null,
      providedTextLen: providedText.length,
      providedHtmlLen: providedHtml.length,
    });

    let articlePlain = providedText || (providedHtml ? toPlainText(providedHtml) : "");
    let captureError: unknown = null;

    if (!articlePlain) {
      if (!pageUrlRaw) {
        return NextResponse.json({ success: false, error: "Missing pageUrl or article content" }, { status: 400 });
      }

      // Try to get content from supported sites first
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
        // If site is not supported, try direct fetch
        captureError = err;
      }

      // Fallback to direct fetch for unsupported sites
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

    console.log("[context-vector][%s] articlePlain length", debugId, articlePlain.length);

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

    const model = getVertexTextModel();

    const resp = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: contextVectorResponseSchema,
      },
    });

    const text = extractTextFromVertex(resp);

    const suggestions = parseContextVectorResponse(text).map(normalizeSuggestion);
    const markdown = buildMarkdownTable(suggestions);

    console.log("[context-vector][%s] output", debugId, {
      suggestions: suggestions.slice(0, 3).map((s) => ({
        before: s.before.slice(0, 60),
        why: s.whyProblemNow.slice(0, 80),
        adjust: s.adjustAsFollows.slice(0, 80),
      })),
      markdownPreview: markdown.slice(0, 140),
    });

    return NextResponse.json({ success: true, suggestions, markdown }, { status: 200 });
  } catch (err: unknown) {
    console.error("[context-vector][error]", err);
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

function extractTextFromVertex(
  resp: Awaited<ReturnType<ReturnType<typeof getVertexTextModel>["generateContent"]>>
) {
  const parts = resp.response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

function parseContextVectorResponse(text: string): ContextVectorSuggestion[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { suggestions?: unknown };
    const rawSuggestions = Array.isArray(parsed?.suggestions)
      ? (parsed.suggestions as unknown[]).slice(0, 3)
      : [];
    return rawSuggestions
      .map((s) => {
        const before = typeof (s as any)?.before === "string" ? (s as any).before : "";
        const whyProblemNow =
          typeof (s as any)?.whyProblemNow === "string" ? (s as any).whyProblemNow : "";
        const adjustAsFollows =
          typeof (s as any)?.adjustAsFollows === "string" ? (s as any).adjustAsFollows : "";
        const afterAdjustRaw = (s as any)?.afterAdjust;
        const afterAdjust =
          typeof afterAdjustRaw === "string" ? afterAdjustRaw : afterAdjustRaw === null ? "" : null;
        return { before, whyProblemNow, adjustAsFollows, afterAdjust };
      })
      .filter((item) => item.before && item.whyProblemNow && item.adjustAsFollows);
  } catch (err) {
    console.warn("[context-vector] parse error", err);
    console.warn("[context-vector] response text:", text);
    return [];
  }
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
