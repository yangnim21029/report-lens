import { NextResponse } from "next/server";
import { env } from "~/env";

const GSC_DB_ENDPOINT = env.GSC_DB_ENDPOINT.replace(/\/$/, "");

export async function GET() {
  try {
    const upstream = `${GSC_DB_ENDPOINT}/api/sites`;
    const resp = await fetch(upstream, {
      headers: { "ngrok-skip-browser-warning": "true" },
      // Disable cache to always reflect the latest
      cache: "no-store",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Upstream error ${resp.status}`, body: text.slice(0, 500) },
        { status: 502 },
      );
    }
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    // Normalize: prefer arrays directly, else common envelopes
    let list: unknown = data;
    if (!Array.isArray(list) && typeof data === "object" && data !== null) {
      const anyData = data as any;
      list = anyData.data || anyData.results || anyData.rows || anyData.sites || data;
    }
    return NextResponse.json(list, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
