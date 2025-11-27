import { NextResponse } from "next/server";
import { z } from "zod";
import { convert } from "html-to-text";
import { getVertexTextModel } from "~/server/vertex/client";
import { fetchKeywordCoverage, buildCoveragePromptParts } from "~/utils/keyword-coverage";
import type { CoverageItem } from "~/utils/keyword-coverage";
import { fetchContentExplorerForQueries } from "~/utils/search-traffic";

// Batch input schema
const BatchItemSchema = z.object({
  url: z.string(),
  row: z.number().optional(),
  page: z.string(),
  bestQuery: z.string().optional(),
  bestQueryClicks: z.number().optional(),
  bestQueryPosition: z.number().optional(),
  bestQueryVolume: z.number().optional(),
  prevBestQuery: z.string().optional(),
  prevBestClicks: z.number().optional(),
  prevBestPosition: z.number().optional(),
  prevMainKeyword: z.string().optional(),
  prevKeywordRank: z.number().optional(),
  prevKeywordTraffic: z.number().optional(),
  totalClicks: z.number().optional(),
  keywords1to10Count: z.number().optional(),
  keywords4to10Count: z.number().optional(),
  totalKeywords: z.number().optional(),
  rank1: z.string().optional(),
  rank2: z.string().optional(),
  rank3: z.string().optional(),
  rank4: z.string().optional(),
  rank5: z.string().optional(),
  rank6: z.string().optional(),
  rank7: z.string().optional(),
  rank8: z.string().optional(),
  rank9: z.string().optional(),
  rank10: z.string().optional(),
  rankGt10: z.string().optional(),
});

const BatchRequestSchema = z.object({
  batch: z.array(BatchItemSchema).max(10), // 限制最多 10 筆
});

// Context vector suggestion schema (reused from context-vector API)
const ContextVectorSuggestionSchema = z.object({
  before: z.string().min(20),
  whyProblemNow: z.string().min(1).max(80),
  adjustAsFollows: z.string().min(1),
  afterAdjust: z.union([z.string().min(20), z.null()]).optional().default(null),
});

const ContextVectorResponseSchema = z.object({
  suggestions: z.array(ContextVectorSuggestionSchema),
});

type BatchItem = z.infer<typeof BatchItemSchema>;
type ContextVectorSuggestion = z.infer<typeof ContextVectorSuggestionSchema>;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validatedInput = BatchRequestSchema.parse(body);
    const { batch } = validatedInput;

    console.log(`[batch-process] Processing ${batch.length} items`);

    // 並行處理所有項目
    const results = await Promise.all(
      batch.map(async (item, index) => {
        try {
          console.log(`[batch-process] Processing item ${index + 1}/${batch.length}: ${item.url}`);
          
          // 處理單一項目
          const result = await processSingleItem(item);
          
          console.log(`[batch-process] Completed item ${index + 1}/${batch.length}: ${item.url}`);
          return result;
        } catch (error) {
          console.error(`[batch-process] Error processing item ${index + 1}/${batch.length}: ${item.url}`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            analysis: '',
            suggestions: [],
            outline: '',
          };
        }
      })
    );

    console.log(`[batch-process] Completed batch processing. Success: ${results.filter(r => r.success).length}/${results.length}`);

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (error) {
    console.error('[batch-process] Batch processing failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Batch processing failed',
      },
      { status: 500 }
    );
  }
}

async function processSingleItem(item: BatchItem) {
  try {
    // Step 1: 執行 analyze
    const analysisResult = await performAnalyze(item);
    
    // Step 2: 執行 context-vector
    const contextResult = await performContextVector(item.url, analysisResult.analysis);
    
    // Step 3: 執行 outline
    const outlineResult = await performOutline(analysisResult.analysis);
    
    return {
      success: true,
      analysis: analysisResult.analysis,
      suggestions: contextResult.suggestions,
      outline: outlineResult.outline,
    };
  } catch (error) {
    throw error;
  }
}

async function performAnalyze(input: BatchItem) {
  const page = input.page;
  
  // Step 1: Fetch article HTML (reused from analyze API)
  const contentResponse = await fetch(page, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)" },
    cache: "no-store",
  });
  
  if (!contentResponse.ok) {
    throw new Error(`Fetch failed: ${contentResponse.status}`);
  }
  
  const html = await contentResponse.text();

  // Step 2: Extract main content (reused from analyze API)
  const articleMatch = html.match(/<article[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/article>/i);
  const mainDivMatch = html.match(/<div[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i);
  const rawBlock = articleMatch?.[1] || mainDivMatch?.[1] || html;
  const textContent = convert(rawBlock, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).slice(0, 6000);

  // Extract meta
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const metaDescMatch = html.match(/<meta[^>]*name=\"description\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
  const ogTitleMatch = html.match(/<meta[^>]*property=\"og:title\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
  const ogDescMatch = html.match(/<meta[^>]*property=\"og:description\"[^>]*content=\"([^\"]*)\"[^>]*>/i);
  const pageTitle = titleMatch ? titleMatch[1] : "";
  const metaDescription = metaDescMatch ? metaDescMatch[1] : "";
  const ogTitle = ogTitleMatch ? ogTitleMatch[1] : "";
  const ogDescription = ogDescMatch ? ogDescMatch[1] : "";

  // Step 3: Build prompt (simplified version of analyze API)
  const bestQuery = input?.bestQuery ?? null;
  const highRankArray = [input?.rank1, input?.rank2, input?.rank3]
    .filter(Boolean)
    .map((line: unknown) => String(line || ""));
  
  const keywordsArray = [input?.rank4, input?.rank5, input?.rank6, input?.rank7, input?.rank8, input?.rank9, input?.rank10]
    .filter(Boolean)
    .map((line: unknown) => String(line || ""));
  
  const keywordsList = keywordsArray.join("\n");

  const region = page.includes("holidaysmart.io") ? (page.match(/\/(hk|tw|sg|my|cn)\//i)?.[1]?.toLowerCase() || "hk") : "hk";
  const locale = {
    hk: { language: "繁體中文（香港）", tone: "親切、地道、生活化" },
    tw: { language: "繁體中文（台灣）", tone: "溫馨、在地、貼心" },
    cn: { language: "簡體中文（中國大陸）", tone: "專業、直接、實用" },
    sg: { language: "繁體中文（新加坡）", tone: "多元、現代、簡潔" },
    my: { language: "繁體中文（馬來西亞）", tone: "多元、友善、實用" },
  } as const;
  const currentLocale = (locale as any)[region] || locale.hk;

  // 簡化的 prompt (移除 keyword coverage 和 content explorer 以提升速度)
  const prompt = `
# Role and Objective
Act as an SEO semantic hijacking strategist. Analyze Rank 4–10 keyword data to identify and prioritize low-friction, high-opportunity terms for semantic equivalence with the Best Query, focusing on user satisfaction and intent match.

# Context Data
- Article URL: ${input.page}
- Regional language: ${currentLocale.language} - ${currentLocale.tone}
- Existing title: ${pageTitle}
- Meta description: ${metaDescription}
- Best Query (Rank 1-3): "${input.bestQuery || "N/A"}" - ${input.bestQueryClicks || 0} clicks - Average rank ${input.bestQueryPosition || "N/A"}
- Previous Best Query: ${input.prevBestQuery ? `"${input.prevBestQuery}" - ${input.prevBestClicks || 0} clicks - Average rank ${input.prevBestPosition || "N/A"}` : "N/A"}
- High-performing keywords (Rank 1-3):
${highRankArray.length > 0 ? highRankArray.join("\n") : "N/A"}
- Keyword list (Rank 4-10):
${keywordsList}

- Article excerpt:
${textContent.substring(0, 4000)}

# Output Format
Provide a concise analysis focusing on semantic hijacking opportunities and implementation recommendations.
`;

  // Step 4: Call Vertex (simplified)
  const model = getVertexTextModel();
  const resp = await model.generateContent({
    systemInstruction: "你是 SEO 語義劫持專家，專責分析搜尋意圖與規劃詞組等價策略。",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const analysis = extractTextFromVertex(resp) || "無法生成分析結果";

  return { analysis };
}

async function performContextVector(pageUrl: string, analysisText: string) {
  // 簡化版的 context-vector 處理
  let articlePlain = "";
  
  try {
    // 嘗試獲取文章內容
    const response = await fetch(pageUrl, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)" },
    });
    
    if (response.ok) {
      const html = await response.text();
      articlePlain = toPlainText(html).slice(0, 8000);
    }
  } catch (error) {
    console.warn(`[context-vector] Failed to fetch content for ${pageUrl}:`, error);
  }

  if (!articlePlain) {
    // 如果無法獲取文章內容，返回空建議
    return { suggestions: [] };
  }

  const prompt = buildContextVectorPrompt(analysisText, articlePlain);

  const model = getVertexTextModel();
  const response = await model.generateContent({
    systemInstruction: "你是資深 SEO 策略師，輸出必須符合指定 JSON 結構。",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const text = extractTextFromVertex(response);

  let parsed: z.infer<typeof ContextVectorResponseSchema> | null = null;
  try {
    parsed = ContextVectorResponseSchema.parse(JSON.parse(text));
  } catch (err) {
    console.warn("[context-vector] parse error", err);
    parsed = { suggestions: [] };
  }
  const suggestions = (parsed?.suggestions ?? []).map(normalizeSuggestion);

  return { suggestions };
}

async function performOutline(analysisText: string) {
  const prompt = buildOutlinePrompt(analysisText);

  const model = getVertexTextModel();
  const resp = await model.generateContent({
    systemInstruction: "你是資深內容規劃顧問，擅長將分析報告整理成清晰的文章建議大綱。",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const outline =
    resp.response?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  
  return { outline };
}

// Helper functions (reused from existing APIs)
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
  return `## 角色與目標
你是一位資深 SEO onPage 優化專家，根據提供的分析內容與原文片段，找出最多三項關鍵內容缺口。

## 必須輸出的 JSON 結構
{
  "suggestions": [
    {
      "before": "原文片段，至少 20 字",
      "whyProblemNow": "40 字以內的 SEO 問題說明",
      "adjustAsFollows": "說明調整方向／操作重點",
      "afterAdjust": "完整可置入的新段落，至少 20 字"
    }
  ]
}

## 輸入資料
- 參考分析：${analysisText || ""}
- 原文文章片段：${articleText || ""}

## 輸出守則
- 僅填上述欄位，所有字串使用繁體中文
- whyProblemNow 限 40 字以內；afterAdjust 至少 20 字
- 建議依 SEO 影響度排序，最多 3 筆
`;
}

function buildOutlinePrompt(analysisText: string) {
  const sanitized = analysisText.length > 8000 ? analysisText.slice(0, 8000) : analysisText;
  return `${sanitized}\n------\n\n根據上述，給我一個 h2/h3 文章大綱\n\n格式如下：\n\nh2 xxx\nh3 xxx\n----\n以上是 prompt, 不要有任何其他建議，只需要輸出文章大綱`;
}

function normalizeSuggestion(s: ContextVectorSuggestion) {
  return {
    before: s.before.trim(),
    whyProblemNow: s.whyProblemNow.trim(),
    adjustAsFollows: s.adjustAsFollows.trim(),
    afterAdjust: (typeof s.afterAdjust === 'string' ? s.afterAdjust : '').trim(),
  } satisfies ContextVectorSuggestion;
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
