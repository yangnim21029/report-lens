"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";

interface OptimizationPanelProps {
  rowData: {
    page: string;
    best_query: string | null;
    best_query_clicks: number | null;
    best_query_position: number | null;
    prev_best_query: string | null;
    prev_best_position: number | null;
    prev_best_clicks: number | null;
    rank_4: string | null;
    rank_5: string | null;
    rank_6: string | null;
    rank_7: string | null;
    rank_8: string | null;
    rank_9: string | null;
    rank_10: string | null;
  };
  isExpanded: boolean;
  onToggle: () => void;
}

export function OptimizationPanel({ rowData, isExpanded, onToggle }: OptimizationPanelProps) {
  const [activeTab, setActiveTab] = useState<"quick" | "paragraph" | "structure">("quick");

  const { mutate: analyzeContent, data, isPending: isLoading, error } = 
    api.optimize.analyzeContent.useMutation();

  // Trigger analysis when expanded for the first time
  useEffect(() => {
    if (isExpanded && !data && !isLoading && !error) {
      analyzeContent({
        page: rowData.page,
        bestQuery: rowData.best_query,
        bestQueryClicks: rowData.best_query_clicks,
        bestQueryPosition: rowData.best_query_position,
        prevBestQuery: rowData.prev_best_query,
        prevBestPosition: rowData.prev_best_position,
        prevBestClicks: rowData.prev_best_clicks,
        rank4: rowData.rank_4,
        rank5: rowData.rank_5,
        rank6: rowData.rank_6,
        rank7: rowData.rank_7,
        rank8: rowData.rank_8,
        rank9: rowData.rank_9,
        rank10: rowData.rank_10,
      });
    }
  }, [isExpanded]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3 text-white">分析中...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-md bg-red-500/20 p-4 text-red-200">
          錯誤: {error.message}
        </div>
      );
    }

    if (!data) return null;

    const getTabContent = () => {
      switch (activeTab) {
        case "quick":
          return data.sections.quickWins || "沒有快速優化建議";
        case "paragraph":
          return data.sections.paragraphAdditions || "沒有段落補充建議";
        case "structure":
          return data.sections.structuralChanges || "沒有結構優化建議";
      }
    };

    return (
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-white/20">
          <button
            onClick={() => setActiveTab("quick")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "quick"
                ? "border-b-2 border-[hsl(280,100%,70%)] text-[hsl(280,100%,70%)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            🎯 快速優化
          </button>
          <button
            onClick={() => setActiveTab("paragraph")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "paragraph"
                ? "border-b-2 border-[hsl(280,100%,70%)] text-[hsl(280,100%,70%)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            📝 段落補充
          </button>
          <button
            onClick={() => setActiveTab("structure")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "structure"
                ? "border-b-2 border-[hsl(280,100%,70%)] text-[hsl(280,100%,70%)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            🔄 結構優化
          </button>
        </div>

        {/* Tab Content */}
        <div className="rounded-lg bg-white/5 p-6">
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-white/90 font-sans">
              {getTabContent()}
            </pre>
          </div>
        </div>

        {/* Keywords Analyzed Badge */}
        {data.keywordsAnalyzed > 0 && (
          <div className="flex justify-end">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
              分析了 {data.keywordsAnalyzed} 個關鍵字
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Analyze Button */}
      <button
        onClick={onToggle}
        disabled={isLoading}
        className="rounded-md bg-[hsl(280,100%,70%)]/20 px-3 py-1 text-sm font-medium text-[hsl(280,100%,70%)] transition hover:bg-[hsl(280,100%,70%)]/30 disabled:opacity-50"
      >
        {isExpanded ? "收起" : "優化建議"}
      </button>

      {/* Panel Content - Rendered conditionally in parent */}
      {isExpanded && (
        <div className="mt-4">
          {renderContent()}
        </div>
      )}
    </>
  );
}