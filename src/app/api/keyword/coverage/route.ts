import { NextResponse } from "next/server";
import { fetchKeywordCoverage } from "~/utils/keyword-coverage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const debugId = Math.random().toString(36).slice(2, 8);
    const url = String(body?.url || "");
    // For "Add SV" use-case, we want the top 20 by highest clicks
    const limit = Number(body?.limit || 20);
    console.log(`[keyword/coverage][${debugId}] incoming`, { url, limit });
    if (!url) return NextResponse.json({ success: false, error: "Missing url" }, { status: 400 });

    console.log(`[keyword/coverage][${debugId}] fetching upstream coverage ...`);
    const data = await fetchKeywordCoverage(url);
    console.log(`[keyword/coverage][${debugId}] upstream response`, {
      success: data?.success,
      coveredLen: Array.isArray(data?.covered) ? data.covered.length : null,
      uncoveredLen: Array.isArray(data?.uncovered) ? data.uncovered.length : null,
    });
    if (!data.success) {
      console.warn(`[keyword/coverage][${debugId}] upstream not successful`);
      return NextResponse.json({ success: false, covered: [], uncovered: [], debugId }, { status: 200 });
    }

    const take = Math.max(1, Math.min(100, limit || 20));

    const toNumber = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const preview = (arr: any[] | undefined, n = 5) =>
      (Array.isArray(arr) ? arr : [])
        .slice(0, n)
        .map((x) => ({ text: x?.text, clicks: x?.gsc?.clicks ?? null, sv: x?.searchVolume ?? null }));

    const coveredAll = Array.isArray(data.covered) ? data.covered : [];
    const uncoveredAll = Array.isArray(data.uncovered) ? data.uncovered : [];

    console.log(`[keyword/coverage][${debugId}] pre-sort preview (covered top 5)`, preview(coveredAll, 5));

    const clickedSvValues = coveredAll
      .map((item: any) => {
        const clicks = toNumber(item?.gsc?.clicks);
        const sv = toNumber(item?.searchVolume);
        return clicks && clicks > 0 && sv !== null ? sv : null;
      })
      .filter((v): v is number => v !== null && v > 0);
    const suggestionThreshold = clickedSvValues.length ? Math.min(...clickedSvValues) : null;

    const seenSuggestions = new Set<string>();
    const sortBySvDesc = (a: any, b: any) => {
      const aSv = toNumber(a?.searchVolume);
      const bSv = toNumber(b?.searchVolume);
      if (aSv === null && bSv === null) return 0;
      if (aSv === null) return 1;
      if (bSv === null) return -1;
      if (aSv === bSv) return 0;
      return (bSv ?? 0) - (aSv ?? 0);
    };

    const normalize = (text: string | undefined | null) =>
      String(text || "")
        .replace(/[\s\u3000]+/g, "")
        .toLowerCase()
        .trim();

    const coveredNormalized = new Set(
      coveredAll
        .map((item: any) => normalize(item?.text))
        .filter((t) => t.length > 0),
    );

    const suggestionCandidates = uncoveredAll
      .filter((item: any) => {
        const norm = normalize(item?.text);
        if (!norm) return false;
        if (coveredNormalized.has(norm)) return false;
        return true;
      })
      .sort(sortBySvDesc);

    const suggested: any[] = [];
    const pushUnique = (item: any) => {
      const key = normalize(item?.text);
      if (!key || seenSuggestions.has(key)) return;
      seenSuggestions.add(key);
      suggested.push(item);
    };

    suggestionCandidates.forEach((item) => {
      pushUnique(item);
    });

    // Sort covered keywords by highest GSC clicks first, then take top N
    const covered = coveredAll.length
      ? [...coveredAll]
          .sort((a, b) => (b?.gsc?.clicks ?? 0) - (a?.gsc?.clicks ?? 0))
          .slice(0, take)
      : [];
    console.log(`[keyword/coverage][${debugId}] post-sort covered (top ${take})`, preview(covered, Math.min(5, take)));
    const remaining = Math.max(0, take - covered.length);
    const uncovered = remaining > 0 ? uncoveredAll.slice(0, remaining) : [];
    console.log(`[keyword/coverage][${debugId}] uncovered fill count`, {
      remaining,
      uncoveredLen: uncovered.length,
      uncoveredPreview: preview(uncovered, Math.min(5, remaining || 5)),
      suggestionsPreview: preview(suggested, Math.min(5, suggested.length || 5)),
      suggestionThreshold,
    });

    return NextResponse.json(
      {
        success: true,
        covered,
        uncovered,
        suggestions: suggested,
        suggestionThreshold,
        debugId,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error(`[keyword/coverage] error`, err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
