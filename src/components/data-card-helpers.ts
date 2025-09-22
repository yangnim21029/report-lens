export type KwRow = {
  rank: string;
  keyword: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  ctr: number | null;
};

export const splitEntries = (raw?: string | null): string[] => {
  if (!raw || typeof raw !== "string") return [];
  const parts = raw.split(/\),\s+/);
  return parts.map((p, i) =>
    i < parts.length - 1 && !p.endsWith(")") ? `${p})` : p,
  );
};

export const parseEntry = (label: string, part: string): KwRow => {
  let m = part.match(/^(.+?)\(\s*click\s*:\s*([\d.]+)\s*,\s*impression\s*:\s*([\d.]+)\s*,\s*position\s*:\s*([\d.]+)\s*,\s*ctr\s*:\s*([\d.]+)%\s*\)$/i);
  if (m) {
    return {
      rank: label,
      keyword: (m[1] ?? "").trim(),
      clicks: Number.isFinite(Number(m[2])) ? Number(m[2]) : null,
      impressions: Number.isFinite(Number(m[3])) ? Number(m[3]) : null,
      position: Number.isFinite(Number(m[4])) ? Number(m[4]) : null,
      ctr: Number.isFinite(Number(m[5])) ? Number(m[5]) : null,
    };
  }
  m = part.match(/^(.+?)\(\s*click\s*:\s*([\d.]+)\s*,\s*impression\s*:\s*([\d.]+)\s*,\s*position\s*:\s*([\d.]+)\s*\)$/i);
  if (m) {
    return {
      rank: label,
      keyword: (m[1] ?? "").trim(),
      clicks: Number.isFinite(Number(m[2])) ? Number(m[2]) : null,
      impressions: Number.isFinite(Number(m[3])) ? Number(m[3]) : null,
      position: Number.isFinite(Number(m[4])) ? Number(m[4]) : null,
      ctr: null,
    };
  }
  const name = part.includes("(") ? part.slice(0, part.indexOf("(")).trim() : part.trim();
  return { rank: label, keyword: name, clicks: null, impressions: null, position: null, ctr: null };
};

export const parseBucket = (label: string, raw?: string | null): KwRow[] => {
  return splitEntries(raw).map((p) => parseEntry(label, p));
};

export const normalizeKeyword = (raw: string): string => {
  try {
    return String(raw)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\u3000\s]+/g, "")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/['"`’“”‘、/\\|,:;._+~!@#$%^&*()（）\[\]【】{}<>?\-]+/g, "");
  } catch {
    return String(raw).trim().toLowerCase();
  }
};

export const collectAllCurrentRows = (data: any): KwRow[] => {
  const rowsTop = [
    ...parseBucket("1", data?.current_rank_1),
    ...parseBucket("2", data?.current_rank_2),
    ...parseBucket("3", data?.current_rank_3),
  ];
  const rowsMid = [
    ...parseBucket("4", data?.current_rank_4),
    ...parseBucket("5", data?.current_rank_5),
    ...parseBucket("6", data?.current_rank_6),
    ...parseBucket("7", data?.current_rank_7),
    ...parseBucket("8", data?.current_rank_8),
    ...parseBucket("9", data?.current_rank_9),
    ...parseBucket("10", data?.current_rank_10),
  ];
  const rowsGt = parseBucket(">10", data?.current_rank_gt10);
  return [...rowsTop, ...rowsMid, ...rowsGt];
};
