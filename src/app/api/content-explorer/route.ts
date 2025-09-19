import { NextResponse } from "next/server";
import { fetchContentExplorerForQueries } from "~/utils/search-traffic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const queries = Array.isArray(body?.queries) ? body.queries.map((x: any) => String(x)).filter(Boolean) : [];
    if (queries.length === 0) {
      return NextResponse.json({ success: false, error: "Missing queries" }, { status: 400 });
    }
    const result = await fetchContentExplorerForQueries(queries);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

