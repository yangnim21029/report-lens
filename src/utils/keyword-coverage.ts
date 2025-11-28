import { getVertexTextModel } from "~/server/vertex/client";
import { COVERAGE_API_URL } from "~/config";
import type { GscStats, CoverageItem, KeywordCoverageResponse } from "~/types";

export type { GscStats, CoverageItem, KeywordCoverageResponse };

/**
 * Fetch keyword coverage data for a URL.
 * Returns covered (with optional GSC stats) and uncovered keywords with search volume.
 */
export async function fetchKeywordCoverage(url: string): Promise<KeywordCoverageResponse> {
  const res = await fetch(COVERAGE_API_URL + encodeURIComponent(url), {
    // Let upstream set caching; always want fresh data during analysis
    cache: "no-store",
  });

  if (!res.ok) {
    return { success: false, covered: [], uncovered: [] };
  }

  const data = (await res.json()) as KeywordCoverageResponse | { success: boolean } | any;
  if (data && data.success) {
    return {
      success: true,
      covered: Array.isArray(data.covered) ? data.covered : [],
      uncovered: Array.isArray(data.uncovered) ? data.uncovered : [],
    };
  }
  return { success: false, covered: [], uncovered: [] };
}

/**
 * Format coverage data into concise text blocks for LLM prompts.
 * - Covered: includes GSC metrics when available; falls back to SV.
 * - Uncovered: lists keyword with SV.
 */
export function buildCoveragePromptParts(covered: CoverageItem[], uncovered: CoverageItem[]) {
  const coveredText = (covered || [])
    .map((item) => {
      if (item?.gsc) {
        const avgPos = typeof item.gsc.avgPosition === "number" ? item.gsc.avgPosition.toFixed(1) : "N/A";
        return `${item.text} (SV: ${item.searchVolume ?? "N/A"}, Clicks: ${item.gsc.clicks}, Imp: ${item.gsc.impressions}, Pos: ${avgPos})`;
      }
      return `${item.text} (SV: ${item?.searchVolume ?? "N/A"})`;
    })
    .join("\n");

  const uncoveredText = (uncovered || [])
    .map((k) => `${k.text} (SV: ${k?.searchVolume ?? "N/A"})`)
    .join("\n");

  return { coveredText: coveredText || "無", uncoveredText: uncoveredText || "無" };
}

/**
 * Optional: Ask Vertex (Gemini) to pick promising uncovered keywords based on covered+GSC context.
 * Returns a newline-separated list of keywords or a short status string.
 */
export async function requestVertexSuggestions(
  covered: CoverageItem[],
  uncovered: CoverageItem[],
  opts?: { model?: string }
): Promise<string> {
  const { coveredText, uncoveredText } = buildCoveragePromptParts(covered, uncovered);

  const prompt = `你是一位頂尖的 SEO 內容策略師。你的任務是分析一份網頁的關鍵字成效報告，並從「未覆蓋關鍵字」列表中，智慧地挑選出最有潛力的新關鍵字，以擴展內容的深度與廣度。

# 背景資訊
- **已覆蓋關鍵字 (Covered Keywords):**
${coveredText}

- **未覆蓋關鍵字 (Uncovered Keywords):**
${uncoveredText}

# 你的任務（精簡版）
請根據上述資料，從「未覆蓋關鍵字」中挑選最符合以下條件的詞：
1. 與已覆蓋強勢關鍵字具高度語意關聯；
2. 能補足內容缺口、降低使用者決策阻力；
3. 具可行搜尋意圖、且有實際搜尋量。

# 輸出格式要求（務必遵守）
- 僅輸出關鍵字本身，每行一個；
- 不要包含任何解釋、標題、編號或符號；
- 若沒有建議，僅輸出「無建議」。`;

  const model = getVertexTextModel(opts?.model);
  const resp = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
  });

  return (
    resp.response?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() || "無建議"
  );
}
