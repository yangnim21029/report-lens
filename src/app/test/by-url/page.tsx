"use client";

import React, { useMemo, useState } from "react";

type Row = Record<string, unknown>;

function normalizeUrl(v: string): string {
  let s = String(v || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s.replace(/\s+/g, "");
}

function hostnameToSiteToken(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return `sc-domain:${host}`;
  } catch {
    return null;
  }
}

export default function TestByUrlPage() {
  const [urlInput, setUrlInput] = useState("");
  const [siteInput, setSiteInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  const normalizedUrl = useMemo(() => normalizeUrl(urlInput), [urlInput]);
  const derivedSite = useMemo(() => hostnameToSiteToken(normalizedUrl), [normalizedUrl]);
  const siteToUse = siteInput.trim() || derivedSite || "";

  async function run() {
    setError(null);
    setRows(null);
    const page = normalizedUrl;
    const site = siteToUse;
    if (!page || !site) {
      setError("請輸入有效的 URL（且可解析主機名）");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/search/by-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, page }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
        return;
      }
      const arr: Row[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.rows)
        ? json.rows
        : [];
      setRows(arr);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>/api/search/by-url 測試</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>
        輸入網址，系統會自動從主機名推導 <code>site</code>（格式：sc-domain:host）。如需覆蓋可自行填寫。
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>URL</span>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://.../article/123456/..."
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>site（可留空，將自動推導）</span>
          <input
            value={siteInput}
            onChange={(e) => setSiteInput(e.target.value)}
            placeholder={derivedSite || "sc-domain:example.com"}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <div style={{ fontSize: 12, color: "#666" }}>
          將使用 site: <code>{siteToUse || "(無法推導，請手動輸入)"}</code>
        </div>

        <div>
          <button onClick={run} disabled={loading} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff" }}>
            {loading ? "查詢中..." : "查詢 by-url"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: "#b00020" }}>錯誤：{error}</div>
      )}

      <div style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>結果</h2>
        {!rows && !error && <div style={{ color: "#666" }}>尚未查詢</div>}
        {rows && rows.length === 0 && <div>空陣列（無資料）</div>}
        {rows && rows.length > 0 && (
          <>
            <div style={{ margin: "8px 0", color: "#444" }}>筆數：{rows.length}</div>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f6f8fa", padding: 12, borderRadius: 8, overflowX: "auto" }}>
{JSON.stringify(rows, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

