import { NextResponse } from "next/server";
import { fetchKeywordCoverage } from "~/utils/keyword-coverage";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = String(body?.url || "");
    const limit = Number(body?.limit || 40);
    if (!url) return NextResponse.json({ success: false, error: "Missing url" }, { status: 400 });

    const data = await fetchKeywordCoverage(url);
    if (!data.success) return NextResponse.json({ success: false, covered: [], uncovered: [] }, { status: 200 });

    const take = Math.max(1, Math.min(100, limit || 40));
    const covered = Array.isArray(data.covered) ? data.covered.slice(0, take) : [];
    const remaining = Math.max(0, take - covered.length);
    const uncovered = Array.isArray(data.uncovered) ? data.uncovered.slice(0, remaining) : [];

    return NextResponse.json({ success: true, covered, uncovered }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

