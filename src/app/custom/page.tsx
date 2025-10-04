"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { DataCard } from "~/components/DataCard";
import { CopyButton } from "~/components/CopyButton";
import { RegionFilter } from "~/components/RegionFilter";
import {
  parseCSVToRows,
  processRows,
  type ProcessedData,
} from "~/utils/custom-csv";

export default function CustomPage() {
  const [csvData, setCsvData] = useState<ProcessedData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setIsProcessing(true);
    setFileName(files.length === 1 ? (files[0]?.name ?? "1 file selected") : `${files.length} files selected`);

    // Helper to read a File as text via Promise
    const readFile = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = reject;
      reader.readAsText(file);
    });

    Promise.all(files.map(readFile))
      .then(texts => {
        const allRows = texts.flatMap(text => parseCSVToRows(text));
        const processed = processRows(allRows);
        setCsvData(processed);
      })
      .catch(() => {
        setCsvData([]);
      })
      .finally(() => setIsProcessing(false));
  }, [parseCSVToRows, processRows]);

  // Filter data based on selected region
  const filteredData = useMemo(() => {
    if (selectedRegion === "all") return csvData;
    return csvData.filter((row) => {
      if (Array.isArray(row.regions) && row.regions.length) {
        return row.regions.includes(selectedRegion);
      }
      if (row.regionCode) return row.regionCode === selectedRegion;
      return row.page.toLowerCase().includes(`/${selectedRegion}/`);
    });
  }, [csvData, selectedRegion]);

  // Generate TSV data for copying (based on filtered data)
  const tsvData = useMemo(() => {
    if (filteredData.length === 0) return "";

    const headers = ["URL", "Potential Traffic", "Total Traffic", "主要關鍵字", "相關關鍵字(1-10) \"keyword (SV: x, Clicks: y, Pos: z)\""];
    const rows = filteredData.map(row => {
      const items = (row as any).rank_items_1to10 as string[] | undefined;
      const filtered = (items || [])
        .filter(item => {
          // Exclude main keyword if present
          const name = item.includes(" (") ? item.slice(0, item.indexOf(" (")) : item;
          return !(row.best_query && name === row.best_query);
        });
      const relatedLines = filtered.join("\n");
      const quotedRelated = relatedLines ? `"${relatedLines.replace(/"/g, '""')}"` : "";

      const best = row.best_query
        ? `${row.best_query} (SV: ${row.best_query_volume ?? 0}, Clicks: ${row.best_query_clicks ?? 0}, Pos: ${(row.best_query_position ?? 0).toFixed(1)})`
        : "N/A";

      return [
        decodeURIComponent(row.page),
        row.potential_traffic?.toString() || "0",
        row.total_clicks?.toString() || "0",
        best,
        quotedRelated,
      ];
    });

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
              multiple
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
                  <p className="text-[var(--ink)] text-[var(--text-xl)] font-bold mb-[var(--space-sm)]">{fileName}</p>
                  <p className="text-[var(--gray-4)]">
                    {csvData.length} URLs ready for analysis
                  </p>
                  <p className="text-[var(--accent-primary)] text-[var(--text-sm)] mt-[var(--space-md)]">
                    Click to upload more files
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-[var(--text-display)] text-[var(--gray-6)] mb-[var(--space-md)]">
                    📁
                  </div>
                  <p className="text-[var(--ink)] text-[var(--text-xl)] font-bold">
                    Drop CSV files here
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
