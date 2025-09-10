"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { DataCard } from "~/components/DataCard";
import { CopyButton } from "~/components/CopyButton";
import { RegionFilter } from "~/components/RegionFilter";

interface CSVRow {
  Keyword: string;
  "Current URL": string;
  "Current organic traffic": string;
  "Current position": string;
  Volume: string;
  "Position change": string;
}

interface ProcessedData {
  page: string;
  best_query: string | null;
  best_query_clicks: number | null;
  best_query_position: number | null;
  // 前期數據
  prev_best_query?: string | null;
  prev_best_clicks?: number | null;
  prev_best_position?: number | null;
  // 統計
  total_clicks: number | null;
  keywords_4to10_count: number | null;
  total_keywords: number | null;
  keywords_4to10_ratio: string | null;
  potential_traffic: number | null;
  rank_4: string | null;
  rank_5: string | null;
  rank_6: string | null;
  rank_7: string | null;
  rank_8: string | null;
  rank_9: string | null;
  rank_10: string | null;
}

export default function CustomPage() {
  const [csvData, setCsvData] = useState<ProcessedData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");

  const processCSV = useCallback((text: string) => {
    // Parse CSV - handle complex CSV with commas in quoted fields
    const parseCSVLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const lines = text.split('\n');
    const headers = parseCSVLine(lines[0] || '');
    
    if (!headers.length) return [];

    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    // Group by URL
    const urlGroups = new Map<string, CSVRow[]>();
    rows.forEach(row => {
      // Accept common URL column aliases
      const url =
        row["Current URL"] ||
        (row as any)["URL"] ||
        (row as any)["Current URL inside"] ||
        "";
      if (url) {
        if (!urlGroups.has(url)) {
          urlGroups.set(url, []);
        }
        urlGroups.get(url)?.push(row);
      }
    });

    // Process each URL group
    const processed: ProcessedData[] = [];
    urlGroups.forEach((keywords, url) => {
      // Helpers for flexible field mapping and safe parsing
      const pick = (obj: Record<string, any>, keys: string[]): string => {
        for (const k of keys) {
          const v = obj[k];
          if (v !== undefined && String(v).trim() !== "") return String(v);
        }
        return "";
      };
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
      // Find CURRENT best query from position 1-3 (highest traffic)
      const topRanking = keywords.filter(k => {
        const pos = toFloat(
          pick(k as any, ["Current position", "Position", "Pos"])
        );
        return pos >= 1 && pos <= 3;
      }).sort((a, b) => {
        const trafficA = toInt(
          pick(a as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        const trafficB = toInt(
          pick(b as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        return trafficB - trafficA;
      });

      // If no keywords in position 1-3, find best from all
      const bestKeyword = topRanking[0] || keywords.sort((a, b) => {
        const trafficA = toInt(
          pick(a as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        const trafficB = toInt(
          pick(b as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        return trafficB - trafficA;
      })[0];
      
      // Find PREVIOUS best query (highest previous traffic)
      const prevBestKeyword = keywords.sort((a, b) => {
        const trafficA = toInt(
          pick(a as any, [
            "Previous organic traffic",
            "Prev. organic traffic",
            "Previous clicks",
            "Previous traffic",
          ])
        );
        const trafficB = toInt(
          pick(b as any, [
            "Previous organic traffic",
            "Prev. organic traffic",
            "Previous clicks",
            "Previous traffic",
          ])
        );
        return trafficB - trafficA;
      })[0];
      
      // Find keywords ranking 4-10
      const rank4to10 = keywords.filter(k => {
        const pos = toFloat(
          pick(k as any, ["Current position", "Position", "Pos"])
        );
        return pos >= 4 && pos <= 10;
      }).sort((a, b) => {
        const posA = toFloat(pick(a as any, ["Current position", "Position", "Pos"]));
        const posB = toFloat(pick(b as any, ["Current position", "Position", "Pos"]));
        return posA - posB;
      });

      // Group by rank position
      const rankGroups: { [key: number]: string[] } = {};
      rank4to10.forEach(k => {
        const pos = Math.round(
          toFloat(pick(k as any, ["Current position", "Position", "Pos"]))
        );
        if (pos >= 4 && pos <= 10) {
          if (!rankGroups[pos]) rankGroups[pos] = [];
          const traffic = pick(k as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ]) || "0";
          const keywordText = pick(k as any, ["Keyword", "Query", "keyword"]);
          rankGroups[pos].push(`${keywordText || "(N/A)"}(${traffic})`);
        }
      });

      // Calculate total traffic from ALL keywords for this URL
      const totalClicks = keywords.reduce((sum, k) => {
        const t = toInt(
          pick(k as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        return sum + t;
      }, 0);

      // Calculate potential traffic (sum of traffic from rank 4-10)
      const potentialTraffic = rank4to10.reduce((sum, k) => {
        const t = toInt(
          pick(k as any, [
            "Current organic traffic",
            "Organic traffic",
            "Clicks",
            "Traffic",
          ])
        );
        return sum + t;
      }, 0);

      processed.push({
        page: url,
        best_query:
          (bestKeyword && pick(bestKeyword as any, ["Keyword", "Query", "keyword"])) ||
          null,
        best_query_clicks:
          (bestKeyword &&
            toInt(
              pick(bestKeyword as any, [
                "Current organic traffic",
                "Organic traffic",
                "Clicks",
                "Traffic",
              ]),
            )) || null,
        best_query_position:
          (bestKeyword &&
            toFloat(
              pick(bestKeyword as any, ["Current position", "Position", "Pos"]),
            )) || null,
        // 前期數據（若無則為 null）
        prev_best_query:
          (prevBestKeyword &&
            pick(prevBestKeyword as any, ["Keyword", "Query", "keyword"])) || null,
        prev_best_clicks:
          (prevBestKeyword &&
            toInt(
              pick(prevBestKeyword as any, [
                "Previous organic traffic",
                "Prev. organic traffic",
                "Previous clicks",
                "Previous traffic",
              ]),
            )) || null,
        prev_best_position:
          (prevBestKeyword &&
            toFloat(
              pick(prevBestKeyword as any, [
                "Previous position",
                "Prev. position",
              ]),
            )) || null,
        // 統計
        total_clicks: totalClicks,
        keywords_4to10_count: rank4to10.length,
        total_keywords: keywords.length,
        keywords_4to10_ratio:
          keywords.length > 0
            ? `${((rank4to10.length / keywords.length) * 100).toFixed(1)}%`
            : null,
        potential_traffic: potentialTraffic,
        rank_4: rankGroups[4]?.join(", ") || null,
        rank_5: rankGroups[5]?.join(", ") || null,
        rank_6: rankGroups[6]?.join(", ") || null,
        rank_7: rankGroups[7]?.join(", ") || null,
        rank_8: rankGroups[8]?.join(", ") || null,
        rank_9: rankGroups[9]?.join(", ") || null,
        rank_10: rankGroups[10]?.join(", ") || null,
      });
    });

    // Sort by potential_traffic descending
    return processed.sort((a, b) => 
      (b.potential_traffic || 0) - (a.potential_traffic || 0)
    );
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const processed = processCSV(text);
      setCsvData(processed);
      setIsProcessing(false);
    };
    reader.readAsText(file);
  }, [processCSV]);

  // Filter data based on selected region
  const filteredData = useMemo(() => {
    return selectedRegion === "all" 
      ? csvData 
      : csvData.filter(row => row.page.includes(`/${selectedRegion}/`));
  }, [csvData, selectedRegion]);

  // Generate TSV data for copying (based on filtered data)
  const tsvData = useMemo(() => {
    if (filteredData.length === 0) return "";
    
    const headers = ["URL", "Potential Traffic", "主要關鍵字"];
    const rows = filteredData.map(row => [
      decodeURIComponent(row.page),
      row.potential_traffic?.toString() || "0",
      row.best_query || "N/A"
    ]);
    
    return [headers, ...rows].map(row => row.join("\t")).join("\n");
  }, [filteredData]);

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="container mx-auto px-[var(--space-lg)] py-[var(--space-md)]">
        <div className="flex justify-between items-center">
          <Link href="/" className="font-black text-[var(--ink)] text-[var(--text-lg)]">
            REPOSTLENS
          </Link>
          <div className="flex gap-[var(--space-md)]">
            <Link 
              href="/" 
              className="text-[var(--gray-4)] hover:text-[var(--accent-primary)] transition-colors font-bold text-[var(--text-sm)] uppercase"
            >
              Search Console
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="noise relative py-[var(--space-xl)]">
        <div className="container mx-auto px-[var(--space-lg)]">
          <h1 className="mb-[var(--space-md)] text-editorial">
            <span className="block text-[var(--accent-primary)] text-[var(--text-3xl)]">
              CUSTOM CSV ANALYSIS
            </span>
          </h1>
          <p className="text-[var(--gray-4)] text-[var(--text-lg)]">
            Upload your SEO export for semantic hijacking analysis
          </p>
        </div>
      </section>

      {/* Upload Section */}
      <section className="container mx-auto px-[var(--space-lg)] py-[var(--space-lg)]">
        <div className="paper-effect p-[var(--space-xl)] text-center">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isProcessing}
            />
            <div className="border-3 border-dashed border-[var(--gray-6)] p-[var(--space-xl)] 
                          hover:border-[var(--accent-primary)] transition-all duration-[var(--duration-normal)]">
              {isProcessing ? (
                <div className="animate-pulse">
                  <span className="text-[var(--gray-4)] text-[var(--text-xl)]">
                    Processing CSV...
                  </span>
                </div>
              ) : fileName ? (
                <div>
                  <p className="text-[var(--ink)] text-[var(--text-xl)] font-bold mb-[var(--space-sm)]">
                    {fileName}
                  </p>
                  <p className="text-[var(--gray-4)]">
                    {csvData.length} URLs ready for analysis
                  </p>
                  <p className="text-[var(--accent-primary)] text-[var(--text-sm)] mt-[var(--space-md)]">
                    Click to upload another file
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-[var(--text-display)] text-[var(--gray-6)] mb-[var(--space-md)]">
                    📁
                  </div>
                  <p className="text-[var(--ink)] text-[var(--text-xl)] font-bold">
                    Drop CSV file here
                  </p>
                  <p className="text-[var(--gray-4)] text-[var(--text-sm)] mt-[var(--space-sm)]">
                    or click to browse
                  </p>
                </div>
              )}
            </div>
          </label>
        </div>
      </section>

      {/* Results Section */}
      {csvData.length > 0 && (
        <section className="container mx-auto px-[var(--space-lg)] py-[var(--space-xl)]">
          <div className="mb-[var(--space-lg)]">
            <div className="flex justify-between items-end mb-[var(--space-md)]">
              <div>
                <h2 className="mb-[var(--space-sm)] font-black text-[var(--ink)] text-[var(--text-2xl)]">
                  ANALYSIS RESULTS
                </h2>
                <p className="text-[var(--gray-4)]">
                  {filteredData.length} of {csvData.length} pages with optimization potential
                </p>
              </div>
              <CopyButton 
                data={tsvData}
                label="Copy TSV"
              />
            </div>

            {/* Region Filter */}
            <RegionFilter 
              data={csvData}
              selectedRegion={selectedRegion}
              onRegionChange={setSelectedRegion}
            />
          </div>

          {/* Data Grid */}
          <div className="grid-editorial">
            {filteredData.map((row, index) => (
              <DataCard
                key={index}
                data={row}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
