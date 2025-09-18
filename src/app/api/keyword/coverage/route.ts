import { NextResponse } from "next/server";
import { fetchKeywordCoverage } from "~/utils/keyword-coverage";

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

    const preview = (arr: any[] | undefined, n = 5) =>
      (Array.isArray(arr) ? arr : [])
        .slice(0, n)
        .map((x) => ({ text: x?.text, clicks: x?.gsc?.clicks ?? null, sv: x?.searchVolume ?? null }));

    console.log(`[keyword/coverage][${debugId}] pre-sort preview (covered top 5)`, preview(data.covered, 5));

    // Sort covered keywords by highest GSC clicks first, then take top N
    const covered = Array.isArray(data.covered)
      ? [...data.covered]
          .sort((a, b) => (b?.gsc?.clicks ?? 0) - (a?.gsc?.clicks ?? 0))
          .slice(0, take)
      : [];
    console.log(`[keyword/coverage][${debugId}] post-sort covered (top ${take})`, preview(covered, Math.min(5, take)));
    const remaining = Math.max(0, take - covered.length);
    const uncovered = Array.isArray(data.uncovered) ? data.uncovered.slice(0, remaining) : [];
    console.log(`[keyword/coverage][${debugId}] uncovered fill count`, {
      remaining,
      uncoveredLen: uncovered.length,
      uncoveredPreview: preview(uncovered, Math.min(5, remaining || 5)),
    });

    return NextResponse.json({ success: true, covered, uncovered, debugId }, { status: 200 });
  } catch (err: unknown) {
    console.error(`[keyword/coverage] error`, err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
