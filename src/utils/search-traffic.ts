/*
Utility to fetch search insights for top-3 keywords (by search volume)
from the upstream search endpoint and compute traffic-oriented signals.

Endpoint example:
GET https://unbiased-remarkably-arachnid.ngrok-free.app/search?query={q}

Response example shape:
{
  success: true,
  query: string,
  count: number,
  results: Array<{ title, url, domain, description, domainAuthority, backdomains, backlinks, topOffset }>,
  paa_count?: number,
  paa_list?: any[],
  merged_results?: any[]
}
*/

export interface KeywordItemLike {
  text: string;
  searchVolume: number | null;
}

export interface UpstreamResultItem {
  topOffset?: number;
  title?: string;
  url?: string;
  domain?: string;
  description?: string;
  domainAuthority?: string; // e.g. "91" or "N/A" or "20+"
  backdomains?: string; // e.g. "146.5K" or "N/A"
  backlinks?: string; // e.g. "3.7M" or "N/A"
}

export interface UpstreamSearchResponse {
  success: boolean;
  query: string;
  count: number;
  results: UpstreamResultItem[];
  paa_count?: number;
  paa_list?: unknown[];
  merged_results?: UpstreamResultItem[];
}

export type SiteType =
  | "gov"
  | "edu"
  | "news"
  | "blog"
  | "retail"
  | "forum"
  | "media"
  | "other";

export interface EnrichedResultItem {
  title: string;
  url: string;
  domain: string;
  topOffset: number | null;
  domainAuthority: number | null;
  backlinks: number | null;
  backdomains: number | null;
  siteType: SiteType;
  score: number; // composite score for ranking candidates
}

export interface QueryInsight {
  query: string;
  count: number;
  avgDomainAuthority: number | null; // average of numeric DA values
  siteTypes: Record<SiteType, number>; // frequency distribution
  topPages: EnrichedResultItem[]; // sorted by score desc
  bestPage: EnrichedResultItem | null;
}

export interface SearchTrafficInsights {
  success: boolean;
  pickedQueries: string[]; // queries analyzed
  insights: QueryInsight[];
  overall: {
    avgDomainAuthority: number | null;
    siteTypes: Record<SiteType, number>;
    bestPage: EnrichedResultItem | null;
  };
}

const ENDPOINT = "https://unbiased-remarkably-arachnid.ngrok-free.app/search?query=";

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "n/a") return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
}

function parseHumanNumber(input?: string | null): number | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s || s.toLowerCase() === "n/a") return null;
  const m = s.match(/^(\d+(?:\.\d+)?)([kKmMbB])?\+?$/);
  if (!m) {
    const n = Number(s.replace(/[^\d.\-]/g, ""));
    return isFinite(n) ? n : null;
  }
  const base = parseFloat(m[1]!);
  if (!isFinite(base)) return null;
  const suf = (m[2] || "").toLowerCase();
  const mult = suf === "k" ? 1_000 : suf === "m" || suf === "b" ? 1_000_000 : 1;
  return Math.round(base * mult);
}

function extractHostname(urlOrDomain?: string | null): string {
  if (!urlOrDomain || urlOrDomain.toLowerCase() === "n/a") return "";
  const raw = String(urlOrDomain).trim();
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function classifySiteType(urlOrDomain?: string | null): SiteType {
  const host = extractHostname(urlOrDomain);
  if (!host) return "other";
  if (host.endsWith(".gov") || host.includes(".gov.")) return "gov";
  if (host.endsWith(".edu") || host.includes(".edu.")) return "edu";
  if (/news|nytimes|cnn|bbc|bloomberg|reuters|forbes|wsj|guardian/.test(host)) return "news";
  if (/blog\.|\/blog\//.test(String(urlOrDomain || ""))) return "blog";
  if (/shop|store|retail|amazon|ebay|shopee|etsy/.test(host)) return "retail";
  if (/reddit|quora|stack(over|)flow|forum|discuss|community/.test(host)) return "forum";
  if (/youtube|vimeo|tiktok|medium|substack/.test(host)) return "media";
  return "other";
}

function buildScore(item: EnrichedResultItem, maxOffset: number): number {
  const da = item.domainAuthority ?? 0;
  const bl = item.backlinks ?? 0;
  const off = item.topOffset ?? maxOffset;
  const offsetBoost = maxOffset > 0 ? (maxOffset - off) / maxOffset : 0; // earlier (smaller) is better
  return da * 1 + Math.log10(bl + 1) * 10 + offsetBoost * 20;
}

function avg(nums: (number | null | undefined)[]): number | null {
  const arr = nums.filter((x): x is number => typeof x === "number" && isFinite(x));
  if (arr.length === 0) return null;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
}

async function fetchUpstream(query: string): Promise<UpstreamSearchResponse | null> {
  const url = ENDPOINT + encodeURIComponent(query);
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) return null;
  let json: any = null;
  try {
    const text = await res.text();
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || json.success !== true) return null;
  // Prefer merged_results when available; otherwise use results
  const results = Array.isArray(json.merged_results) && json.merged_results.length > 0
    ? json.merged_results
    : Array.isArray(json.results) ? json.results : [];
  return { ...json, results } as UpstreamSearchResponse;
}

export async function fetchSearchTrafficInsights(
  keywords: KeywordItemLike[],
): Promise<SearchTrafficInsights> {
  const picked = (Array.isArray(keywords) ? keywords : [])
    .filter((k) => typeof k?.searchVolume === "number" && (k.searchVolume as number) > 0 && k.text)
    .sort((a, b) => (b.searchVolume as number) - (a.searchVolume as number))
    .slice(0, 3)
    .map((k) => String(k.text));

  const responses = await Promise.all(
    picked.map(async (q) => ({ q, data: await fetchUpstream(q) })),
  );

  const insights: QueryInsight[] = responses.map(({ q, data }) => {
    const items = (data?.results || []) as UpstreamResultItem[];
    const maxOffset = Math.max(...items.map((r) => toNumberOrNull(r.topOffset) ?? 0), 0);
    const enriched: EnrichedResultItem[] = items.map((r) => {
      const url = r.url && r.url !== "N/A" ? String(r.url) : "";
      const domain = extractHostname(r.domain || url);
      const da = toNumberOrNull(r.domainAuthority);
      const backlinks = parseHumanNumber(r.backlinks ?? null);
      const backdomains = parseHumanNumber(r.backdomains ?? null);
      const topOffset = toNumberOrNull(r.topOffset);
      const siteType = classifySiteType(url || domain);
      const base: EnrichedResultItem = {
        title: r.title && r.title !== "N/A" ? String(r.title) : (url || domain || "N/A"),
        url: url || "",
        domain,
        topOffset,
        domainAuthority: da,
        backlinks,
        backdomains,
        siteType,
        score: 0,
      };
      return { ...base, score: buildScore(base, maxOffset || 1) };
    });

    // Sort by score desc and take top 5 for reporting
    const topPages = enriched
      .filter((x) => x.url || x.domain)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const avgDomainAuthority = avg(enriched.map((x) => x.domainAuthority));
    const siteTypes: Record<SiteType, number> = { gov: 0, edu: 0, news: 0, blog: 0, retail: 0, forum: 0, media: 0, other: 0 };
    for (const x of enriched) siteTypes[x.siteType] = (siteTypes[x.siteType] || 0) + 1;

    return {
      query: q,
      count: data?.count ?? enriched.length,
      avgDomainAuthority,
      siteTypes,
      topPages,
      bestPage: topPages[0] || null,
    };
  });

  // Overall aggregates
  const overallAvgDA = avg(insights.map((i) => i.avgDomainAuthority));
  const overallTypes: Record<SiteType, number> = { gov: 0, edu: 0, news: 0, blog: 0, retail: 0, forum: 0, media: 0, other: 0 };
  for (const it of insights) {
    for (const k of Object.keys(overallTypes) as SiteType[]) {
      overallTypes[k] += it.siteTypes[k] || 0;
    }
  }
  const allTop = insights.flatMap((i) => i.topPages);
  const bestOverall = allTop.sort((a, b) => b.score - a.score)[0] || null;

  return {
    success: true,
    pickedQueries: picked,
    insights,
    overall: {
      avgDomainAuthority: overallAvgDA,
      siteTypes: overallTypes,
      bestPage: bestOverall,
    },
  };
}

// Convenience: pick top-3 queries and return them directly
export function pickTop3QueriesBySV(keywords: KeywordItemLike[]): string[] {
  return (keywords || [])
    .filter((k) => typeof k?.searchVolume === "number" && (k.searchVolume as number) > 0 && k.text)
    .sort((a, b) => (b.searchVolume as number) - (a.searchVolume as number))
    .slice(0, 3)
    .map((k) => String(k.text));
}

// Content Explorer: accept queries directly (no need for SV)
export async function fetchContentExplorerForQueries(queries: string[]): Promise<SearchTrafficInsights> {
  const picked = (queries || []).map((q) => String(q)).filter(Boolean).slice(0, 3);

  const responses = await Promise.all(picked.map(async (q) => ({ q, data: await fetchUpstream(q) })));

  const insights: QueryInsight[] = responses.map(({ q, data }) => {
    const items = (data?.results || []) as UpstreamResultItem[];
    const maxOffset = Math.max(...items.map((r) => toNumberOrNull(r.topOffset) ?? 0), 0);
    const enriched: EnrichedResultItem[] = items.map((r) => {
      const url = r.url && r.url !== "N/A" ? String(r.url) : "";
      const domain = extractHostname(r.domain || url);
      const da = toNumberOrNull(r.domainAuthority);
      const backlinks = parseHumanNumber(r.backlinks ?? null);
      const backdomains = parseHumanNumber(r.backdomains ?? null);
      const topOffset = toNumberOrNull(r.topOffset);
      const siteType = classifySiteType(url || domain);
      const base: EnrichedResultItem = {
        title: r.title && r.title !== "N/A" ? String(r.title) : (url || domain || "N/A"),
        url: url || "",
        domain,
        topOffset,
        domainAuthority: da,
        backlinks,
        backdomains,
        siteType,
        score: 0,
      };
      return { ...base, score: buildScore(base, maxOffset || 1) };
    });

    const topPages = enriched
      .filter((x) => x.url || x.domain)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const avgDomainAuthority = avg(enriched.map((x) => x.domainAuthority));
    const siteTypes: Record<SiteType, number> = { gov: 0, edu: 0, news: 0, blog: 0, retail: 0, forum: 0, media: 0, other: 0 };
    for (const x of enriched) siteTypes[x.siteType] = (siteTypes[x.siteType] || 0) + 1;

    return {
      query: q,
      count: data?.count ?? enriched.length,
      avgDomainAuthority,
      siteTypes,
      topPages,
      bestPage: topPages[0] || null,
    };
  });

  const overallAvgDA = avg(insights.map((i) => i.avgDomainAuthority));
  const overallTypes: Record<SiteType, number> = { gov: 0, edu: 0, news: 0, blog: 0, retail: 0, forum: 0, media: 0, other: 0 };
  for (const it of insights) {
    for (const k of Object.keys(overallTypes) as SiteType[]) {
      overallTypes[k] += it.siteTypes[k] || 0;
    }
  }
  const allTop = insights.flatMap((i) => i.topPages);
  const bestOverall = allTop.sort((a, b) => b.score - a.score)[0] || null;

  return {
    success: true,
    pickedQueries: picked,
    insights,
    overall: {
      avgDomainAuthority: overallAvgDA,
      siteTypes: overallTypes,
      bestPage: bestOverall,
    },
  };
}
