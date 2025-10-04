export interface CSVRow {
  Keyword: string;
  Country: string;
  Location: string;
  Entities: string;
  "SERP features": string;
  Volume: string;
  "Previous organic traffic": string;
  "Current organic traffic": string;
  "Organic traffic change": string;
  "Previous position": string;
  "Current position": string;
  "Position change": string;
  "Previous URL inside": string;
  "Previous URL": string;
  "Current URL inside": string;
  "Current URL": string;
  Branded: string;
  Local: string;
  Navigational: string;
  Informational: string;
  Commercial: string;
  Transactional: string;
}

export interface ProcessedData {
  page: string;
  country?: string | null;
  regionCode?: string | null;
  regions?: string[] | null;
  best_query: string | null;
  best_query_clicks: number | null;
  best_query_position: number | null;
  best_query_volume?: number | null;
  prev_best_query?: string | null;
  prev_best_clicks?: number | null;
  prev_best_position?: number | null;
  prev_main_keyword?: string | null;
  prev_keyword_rank?: number | null;
  prev_keyword_traffic?: number | null;
  total_clicks: number | null;
  keywords_1to10_count: number | null;
  keywords_4to10_count: number | null;
  total_keywords: number | null;
  keywords_1to10_ratio: string | null;
  keywords_4to10_ratio: string | null;
  potential_traffic: number | null;
  current_rank_1?: string | null;
  current_rank_2?: string | null;
  current_rank_3?: string | null;
  current_rank_4?: string | null;
  current_rank_5?: string | null;
  current_rank_6?: string | null;
  current_rank_7?: string | null;
  current_rank_8?: string | null;
  current_rank_9?: string | null;
  current_rank_10?: string | null;
  current_rank_gt10?: string | null;
  rank_1?: string | null;
  rank_2?: string | null;
  rank_3?: string | null;
  rank_4?: string | null;
  rank_5?: string | null;
  rank_6?: string | null;
  rank_7?: string | null;
  rank_8?: string | null;
  rank_9?: string | null;
  rank_10?: string | null;
  rank_items_1to10?: string[];
}

export function parseCSVToRows(text: string): CSVRow[] {
  const parseCSVLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "\"") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const lines = text.split("\n");
  const headers = parseCSVLine(lines[0] || "");
  if (!headers.length) return [];

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row as unknown as CSVRow);
  }
  return rows;
}

function inferRegionFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("/hk/")) return "hk";
  if (lower.includes("/tw/")) return "tw";
  if (lower.includes("/sg/")) return "sg";
  if (lower.includes("/my/")) return "my";
  if (lower.includes("/cn/")) return "cn";
  return null;
}

function normalizeRegionCode(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["hk", "hong kong", "hongkong"].includes(v)) return "hk";
  if (["tw", "taiwan"].includes(v)) return "tw";
  if (["sg", "singapore"].includes(v)) return "sg";
  if (["my", "malaysia"].includes(v)) return "my";
  if (["cn", "china", "china mainland", "mainland china"].includes(v)) return "cn";
  return null;
}

const toInt = (val: string | number): number => {
  const s = String(val ?? "").replace(/[ ,]/g, "");
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
};

const toFloat = (val: string | number): number => {
  const s = String(val ?? "").replace(/[ ,]/g, "");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};

export function processRows(rows: CSVRow[]): ProcessedData[] {
  const urlGroups = new Map<string, CSVRow[]>();
  rows.forEach((row) => {
    const url = row["Current URL"] || row["Current URL inside"] || "";
    if (!url) return;
    if (!urlGroups.has(url)) urlGroups.set(url, []);
    urlGroups.get(url)!.push(row);
  });

  const processed: ProcessedData[] = [];

  urlGroups.forEach((keywords, url) => {
    const topRanking = keywords
      .filter((k) => {
        const pos = toFloat(k["Current position"]);
        return pos >= 1 && pos <= 3;
      })
      .sort((a, b) => toInt(b["Current organic traffic"]) - toInt(a["Current organic traffic"]));

    const bestKeyword =
      topRanking[0] ||
      [...keywords].sort(
        (a, b) => toInt(b["Current organic traffic"]) - toInt(a["Current organic traffic"]),
      )[0];

    const prevBestKeyword = [...keywords].sort(
      (a, b) => toInt(b["Previous organic traffic"]) - toInt(a["Previous organic traffic"]),
    )[0];

    const rank1to10 = keywords
      .filter((k) => {
        const pos = toFloat(k["Current position"]);
        return pos >= 1 && pos <= 10;
      })
      .sort((a, b) => toFloat(a["Current position"]) - toFloat(b["Current position"]));

    const rank4to10 = keywords
      .filter((k) => {
        const pos = toFloat(k["Current position"]);
        return pos >= 4 && pos <= 10;
      })
      .sort((a, b) => toFloat(a["Current position"]) - toFloat(b["Current position"]));

    const rankGroups: { [key: number]: string[] } = {};
    const rankGt10: string[] = [];
    const items1to10: string[] = [];
    const seenNames = new Set<string>();

    const formatBucketEntry = (row: CSVRow) => {
      const keywordText = (row.Keyword || "(N/A)").trim();
      const clicks = toInt(row["Current organic traffic"]);
      const volume = toInt(row.Volume);
      const position = toFloat(row["Current position"]);
      const entry = `${keywordText}(click: ${clicks}, impression: ${volume}, position: ${position.toFixed(1)})`;
      return { keywordText, clicks, volume, position, entry };
    };

    keywords.forEach((row) => {
      const { keywordText, clicks, volume, position, entry } = formatBucketEntry(row);
      const rounded = Math.round(position);
      if (position >= 1 && position <= 10) {
        (rankGroups[rounded] ||= []).push(entry);
        if (!seenNames.has(keywordText)) {
          seenNames.add(keywordText);
          items1to10.push(
            `${keywordText} (SV: ${volume || 0}, Clicks: ${clicks}, Pos: ${position.toFixed(1)})`,
          );
        }
      } else if (position > 10) {
        rankGt10.push(entry);
      }
    });

    const totalClicks = keywords.reduce((sum, k) => sum + toInt(k["Current organic traffic"]), 0);
    const potentialTraffic = rank4to10.reduce((sum, k) => sum + toInt(k["Current organic traffic"]), 0);

    const regionCandidates = new Set<string>();
    keywords.forEach((k) => {
      const candidate = normalizeRegionCode(k.Country || k.Location);
      if (candidate) regionCandidates.add(candidate);
    });
    const urlRegion = inferRegionFromUrl(url);
    if (urlRegion) regionCandidates.add(urlRegion);

    const countryRaw = keywords[0]?.Country || keywords[0]?.Location || "";
    const countryRegion = normalizeRegionCode(countryRaw);
    if (countryRegion) regionCandidates.add(countryRegion);

    const regions = Array.from(regionCandidates);
    const regionCode = countryRegion || regions[0] || null;

    processed.push({
      page: url,
      country: countryRaw || null,
      regionCode,
      regions: regions.length ? regions : null,
      best_query: bestKeyword?.Keyword || null,
      best_query_clicks: bestKeyword ? toInt(bestKeyword["Current organic traffic"]) : null,
      best_query_position: bestKeyword ? toFloat(bestKeyword["Current position"]) : null,
      best_query_volume: bestKeyword ? toInt(bestKeyword.Volume) : null,
      prev_best_query: prevBestKeyword?.Keyword || null,
      prev_best_clicks: prevBestKeyword ? toInt(prevBestKeyword["Previous organic traffic"]) : null,
      prev_best_position: prevBestKeyword ? toFloat(prevBestKeyword["Previous position"]) : null,
      prev_main_keyword: prevBestKeyword?.Keyword || null,
      prev_keyword_rank: prevBestKeyword ? toFloat(prevBestKeyword["Previous position"]) : null,
      prev_keyword_traffic: prevBestKeyword ? toInt(prevBestKeyword["Previous organic traffic"]) : null,
      total_clicks: totalClicks,
      keywords_1to10_count: rank1to10.length,
      keywords_4to10_count: rank4to10.length,
      total_keywords: keywords.length,
      keywords_1to10_ratio: keywords.length
        ? `${((rank1to10.length / keywords.length) * 100).toFixed(1)}%`
        : null,
      keywords_4to10_ratio: keywords.length
        ? `${((rank4to10.length / keywords.length) * 100).toFixed(1)}%`
        : null,
      potential_traffic: potentialTraffic,
      current_rank_1: rankGroups[1]?.join(", ") || null,
      current_rank_2: rankGroups[2]?.join(", ") || null,
      current_rank_3: rankGroups[3]?.join(", ") || null,
      current_rank_4: rankGroups[4]?.join(", ") || null,
      current_rank_5: rankGroups[5]?.join(", ") || null,
      current_rank_6: rankGroups[6]?.join(", ") || null,
      current_rank_7: rankGroups[7]?.join(", ") || null,
      current_rank_8: rankGroups[8]?.join(", ") || null,
      current_rank_9: rankGroups[9]?.join(", ") || null,
      current_rank_10: rankGroups[10]?.join(", ") || null,
      current_rank_gt10: rankGt10.join(", ") || null,
      rank_1: rankGroups[1]?.join(", ") || null,
      rank_2: rankGroups[2]?.join(", ") || null,
      rank_3: rankGroups[3]?.join(", ") || null,
      rank_4: rankGroups[4]?.join(", ") || null,
      rank_5: rankGroups[5]?.join(", ") || null,
      rank_6: rankGroups[6]?.join(", ") || null,
      rank_7: rankGroups[7]?.join(", ") || null,
      rank_8: rankGroups[8]?.join(", ") || null,
      rank_9: rankGroups[9]?.join(", ") || null,
      rank_10: rankGroups[10]?.join(", ") || null,
      rank_items_1to10: items1to10,
    });
  });

  return processed.sort((a, b) => (b.potential_traffic || 0) - (a.potential_traffic || 0));
}
