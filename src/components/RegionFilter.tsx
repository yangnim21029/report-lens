"use client";

interface RegionFilterProps {
  data: Array<{ page: string; regionCode?: string | null; regions?: string[] | null }>;
  selectedRegion: string;
  onRegionChange: (region: string) => void;
}

export function RegionFilter({ data, selectedRegion, onRegionChange }: RegionFilterProps) {
  // Extract available regions from data
  const regionFromUrl = (url: string): string | null => {
    const lower = url.toLowerCase();
    if (lower.includes("/hk/")) return "hk";
    if (lower.includes("/tw/")) return "tw";
    if (lower.includes("/sg/")) return "sg";
    if (lower.includes("/my/")) return "my";
    if (lower.includes("/cn/")) return "cn";
    return null;
  };

  const availableRegions = Array.from(
    new Set(
      data.flatMap((row) => {
        if (Array.isArray(row.regions) && row.regions.length) return row.regions;
        const codes: string[] = [];
        if (row.regionCode) codes.push(row.regionCode);
        const fallback = regionFromUrl(row.page);
        if (fallback) codes.push(fallback);
        return codes;
      })
    )
  ).sort();

  // Don't render if no regions or only one region
  if (availableRegions.length <= 1) return null;

  const regionNames: Record<string, string> = {
    hk: "香港",
    tw: "台灣",
    sg: "新加坡",
    my: "馬來西亞",
    cn: "中國",
    us: "美國",
    jp: "日本",
    th: "泰國",
    ca: "加拿大",
    kr: "韓國"
  };

  return (
    <div className="paper-effect p-[var(--space-md)] mb-[var(--space-md)]">
      <h3 className="font-bold text-[var(--ink)] text-[var(--text-sm)] uppercase mb-[var(--space-sm)]">
        地區過濾
      </h3>
      <div className="flex gap-[var(--space-md)] flex-wrap">
        <label className="flex items-center gap-[var(--space-xs)] cursor-pointer">
          <input
            type="radio"
            name="region"
            value="all"
            checked={selectedRegion === "all"}
            onChange={(e) => onRegionChange(e.target.value)}
            className="accent-[var(--accent-primary)]"
          />
          <span className="text-[var(--ink)] font-medium">全部</span>
        </label>
        {availableRegions.map(region => (
          <label key={region} className="flex items-center gap-[var(--space-xs)] cursor-pointer">
            <input
              type="radio"
              name="region"
              value={region}
              checked={selectedRegion === region}
              onChange={(e) => onRegionChange(e.target.value)}
              className="accent-[var(--accent-primary)]"
            />
            <span className="text-[var(--ink)] font-medium">
              {regionNames[region as keyof typeof regionNames] || region.toUpperCase()}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
