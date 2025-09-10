"use client";

interface RegionFilterProps {
  data: Array<{ page: string }>;
  selectedRegion: string;
  onRegionChange: (region: string) => void;
}

export function RegionFilter({ data, selectedRegion, onRegionChange }: RegionFilterProps) {
  // Extract available regions from data
  const availableRegions = Array.from(
    new Set(
      data
        .map(row => {
          const url = row.page;
          if (url.includes("/hk/")) return "hk";
          if (url.includes("/tw/")) return "tw";
          if (url.includes("/sg/")) return "sg";
          if (url.includes("/my/")) return "my";
          if (url.includes("/cn/")) return "cn";
          return null;
        })
        .filter(Boolean)
    )
  ).sort();

  // Don't render if no regions or only one region
  if (availableRegions.length <= 1) return null;

  const regionNames = {
    hk: "香港",
    tw: "台灣", 
    sg: "新加坡",
    my: "馬來西亞",
    cn: "中國"
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