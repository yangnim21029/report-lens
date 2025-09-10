"use client";

import { memo, useCallback, useState } from "react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { api } from "~/trpc/react";
import {
  extractAnalysisData,
  formatAsCSV,
  formatAsEmail,
  formatAsMarkdown,
} from "~/utils/extract-format-html";

export const DataCard = memo(function DataCard({
  data,
  onModalChange,
}: { data: any; onModalChange?: (isOpen: boolean) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [isSendingToChat, setIsSendingToChat] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  const {
    mutate: analyzeContent,
    data: analysis,
    isPending: isLoading,
    error,
  } = api.optimize.analyzeContent.useMutation();

  const { mutate: sendToChat } = api.chat.sendAnalysisToChat.useMutation({
    onMutate: () => {
      setIsSendingToChat(true);
    },
    onSuccess: (result) => {
      if (result.success) {
        alert("Analysis sent to Google Chat successfully!");
      } else {
        alert(`Failed to send to Chat: ${result.error}`);
      }
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
    onSettled: () => {
      setIsSendingToChat(false);
    },
  });

  const { mutate: generateAIEmail, isPending: isGeneratingEmail } =
    api.report.generateEmail.useMutation({
      onSuccess: async (result) => {
        if (result.success && result.emailContent) {
          try {
            await navigator.clipboard.writeText(result.emailContent);
            setCopiedFormat("email");
            setTimeout(() => {
              setCopiedFormat(null);
            }, 2000);
          } catch (error) {
            console.error("Failed to copy to clipboard:", error);
            alert("Failed to copy to clipboard");
          }
        } else {
          alert("Failed to generate AI email. Using standard format.");
          // Fallback to standard format
          handleCopyToClipboard("email", true);
        }
      },
      onError: (error) => {
        console.error("AI email generation error:", error);
        alert("Failed to generate AI email. Using standard format.");
        // Fallback to standard format
        handleCopyToClipboard("email", true);
      },
    });

  const { mutate: generateContextVector, isPending: isGeneratingContext } =
    api.report.generateContextVector.useMutation({
      onSuccess: async (result) => {
        if (result.success && result.content) {
          try {
            await navigator.clipboard.writeText(result.content);
            setCopiedFormat("csv");
            setTimeout(() => setCopiedFormat(null), 2000);
          } catch (e) {
            alert("Failed to copy generated context vector to clipboard");
          }
        } else {
          alert(`Failed to generate context vector: ${result.error || "unknown"}`);
        }
      },
      onError: (err) => {
        console.error("Context vector generation error:", err);
        alert("Failed to generate context vector");
      },
    });

  const handleAnalyze = useCallback(() => {
    if (!hasAnalyzed && !isLoading) {
      setHasAnalyzed(true);
      analyzeContent({
        page: data.page,
        bestQuery: data.best_query,
        bestQueryClicks: data.best_query_clicks,
        bestQueryPosition: data.best_query_position,
        // 前期數據
        prevBestQuery: data.prev_best_query,
        prevBestPosition: data.prev_best_position,
        prevBestClicks: data.prev_best_clicks,
        // 排名關鍵詞
        rank4: data.rank_4,
        rank5: data.rank_5,
        rank6: data.rank_6,
        rank7: data.rank_7,
        rank8: data.rank_8,
        rank9: data.rank_9,
        rank10: data.rank_10,
      });
    }
    if (!isExpanded) {
      setIsExpanded(true);
      onModalChange?.(true);
    }
  }, [hasAnalyzed, isLoading, analyzeContent, data, isExpanded, onModalChange]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    onModalChange?.(false);
  }, [onModalChange]);

  const handleSendToChat = useCallback(() => {
    if (analysis && analysis.analysis) {
      sendToChat({
        analysis: analysis.analysis,
        pageData: {
          page: data.page,
          best_query: data.best_query || "",
        },
      });
    }
  }, [analysis, sendToChat, data]);

  const handleCopyToClipboard = useCallback(
    async (format: "markdown" | "csv" | "email", isStandardFallback = false) => {
      if (!analysis || !analysis.analysis) return;

      // For email format and not a fallback, try AI generation first
      if (format === "email" && !isStandardFallback && !isGeneratingEmail) {
        generateAIEmail({
          analysisText: analysis.analysis,
          pageData: {
            page: data.page,
            best_query: data.best_query || "",
          },
        });
        return;
      }

      // Standard format handling (for non-email or fallback)
      try {
        const extractedData = extractAnalysisData(analysis.analysis, {
          page: data.page,
          best_query: data.best_query || "",
        });

        let content = "";
        switch (format) {
          case "markdown":
            content = formatAsMarkdown(extractedData);
            break;
          case "csv":
            // Repurpose CSV to generate context vector using AI with raw analysis + original article
            generateContextVector({ analysisText: analysis.analysis, pageUrl: data.page });
            return; // handled asynchronously
          case "email":
            content = formatAsEmail(extractedData);
            break;
        }

        await navigator.clipboard.writeText(content);
        setCopiedFormat(format);

        // Reset copied state after 2 seconds
        setTimeout(() => {
          setCopiedFormat(null);
        }, 2000);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        alert("Failed to copy to clipboard");
      }
    },
    [analysis, data, generateAIEmail, isGeneratingEmail],
  );

  // Get click intensity for visual indicator
  const clickIntensity = Math.min(100, (data.best_query_clicks || 0) / 10);

  // Format URL for display
  const formatUrl = (url: string) => {
    try {
      const decoded = decodeURIComponent(url);
      const pathParts = decoded.split("/");
      const lastPart =
        pathParts[pathParts.length - 1] ?? pathParts[pathParts.length - 2] ?? "";

      // Remove query parameters and clean up
      const [beforeQuery = ""] = String(lastPart).split("?");
      const [beforeHash = ""] = beforeQuery.split("#");
      const cleanPart = beforeHash;

      // Add ellipsis if too long
      if (cleanPart.length > 25) {
        return cleanPart.substring(0, 22) + "...";
      }
      return cleanPart;
    } catch {
      // Fallback if decode fails
      const parts = url.split("/");
      const last = parts[parts.length - 1] || "homepage";
      return last.length > 25 ? last.substring(0, 22) + "..." : last;
    }
  };

  return (
    <article className="group relative border border-[var(--gray-7)] bg-white transition-all duration-[var(--duration-normal)] hover:border-[var(--gray-4)]">
      {/* Click intensity indicator - subtle left border */}
      <div
        className="absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b from-[var(--accent-primary)] to-transparent"
        style={{ opacity: Math.min(1, clickIntensity / 100 + 0.3) }}
      />

      <div className="p-[var(--space-lg)]">
        {/* Header: Query and Clicks */}
        <div className="mb-[var(--space-md)]">
          {data.best_query && (
            <div className="mb-[var(--space-xs)] flex items-start justify-between gap-[var(--space-sm)]">
              <h3 className="line-clamp-2 flex-1 font-bold text-[var(--ink)] text-[var(--text-lg)] transition-colors group-hover:text-[var(--accent-primary)]">
                {data.best_query}
              </h3>
              {data.potential_traffic && (
                <span
                  className="rounded-sm bg-[var(--accent-primary)] px-[var(--space-sm)] py-1 font-bold text-[var(--paper)] text-[var(--text-xs)]"
                  title="Potential traffic if optimized"
                >
                  🎯 {Math.round(data.potential_traffic)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-[var(--space-md)]">
            <div className="flex items-baseline gap-[var(--space-xs)]">
              <span className="font-black text-[var(--accent-primary)] text-[var(--text-xl)]">
                {data.best_query_clicks || 0}
              </span>
              <span className="text-[var(--gray-5)] text-[var(--text-xs)] uppercase">
                clicks
              </span>
            </div>
            {data.best_query_position && (
              <div className="flex items-center gap-[var(--space-xs)] rounded-sm bg-[var(--gray-8)] px-[var(--space-sm)] py-1">
                <span className="text-[var(--gray-5)] text-[var(--text-xs)]">#</span>
                <span className="font-bold text-[var(--gray-3)] text-[var(--text-sm)]">
                  {data.best_query_position.toFixed(1)}
                </span>
                {data.position_change !== null &&
                  data.position_change !== undefined && (
                    <span
                      className={`ml-1 font-bold text-[var(--text-xs)] ${
                        data.position_change > 0
                          ? "text-green-500"
                          : data.position_change < 0
                            ? "text-red-500"
                            : "text-[var(--gray-5)]"
                      }`}
                    >
                      {data.position_change > 0
                        ? "↑"
                        : data.position_change < 0
                          ? "↓"
                          : "-"}
                      {Math.abs(data.position_change).toFixed(1)}
                    </span>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* URL with Link and Stats - Properly formatted */}
        <div className="mb-[var(--space-md)]">
        <a
          href={data.page}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-[var(--space-xs)] block truncate text-[var(--gray-5)] text-[var(--text-xs)] transition-colors hover:text-[var(--accent-primary)]"
          title={data.page}
        >
          {formatUrl(data.page)}
        </a>
        {/* Stats bar */}
        <div className="flex items-center gap-[var(--space-md)] text-[var(--gray-5)] text-[var(--text-xs)]">
          {data.keywords_4to10_count !== null &&
            data.total_keywords !== null && (
              <span title="Keywords ranking 4-10 / Total keywords">
                🎯 {data.keywords_4to10_count}/{data.total_keywords} words
              </span>
            )}
          {data.keywords_4to10_ratio !== null && (
            <span title="Percentage of keywords ranking 4-10">
              📈 {data.keywords_4to10_ratio}
            </span>
          )}
          {data.prev_best_query &&
            data.prev_best_query !== data.best_query && (
              <span
                title="Previous best query"
                className="text-[var(--gray-6)] italic"
              >
                🔄 {data.prev_best_query}
              </span>
            )}
        </div>
        </div>

        {/* Actions Row - Improved styling */}
        <div className="flex items-center gap-[var(--space-sm)]">
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="flex-1 border-2 border-[var(--ink)] bg-transparent px-[var(--space-md)] py-[var(--space-sm)] font-bold text-[var(--ink)] text-[var(--text-sm)] uppercase transition-all duration-[var(--duration-fast)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
        >
          {isLoading ? "LOADING..." : "ANALYZE"}
        </button>

        {analysis && (
          <div className="flex gap-[var(--space-xs)]">
            <button
              onClick={() => handleCopyToClipboard("markdown")}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
              title="Copy as Markdown"
            >
              {copiedFormat === "markdown" ? "✓" : "MD"}
            </button>
            <button
              onClick={() => handleCopyToClipboard("csv")}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
              title="Copy as CSV"
            >
          {isGeneratingContext ? "..." : copiedFormat === "csv" ? "✓" : "CSV"}
        </button>
            <button
              onClick={() => handleCopyToClipboard("email")}
              disabled={isGeneratingEmail}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50 disabled:cursor-not-allowed"
              title={isGeneratingEmail ? "Generating AI Email..." : "Copy as Email (AI Enhanced)"}
            >
              {isGeneratingEmail ? "..." : copiedFormat === "email" ? "✓" : "✉"}
            </button>
          </div>
        )}

        <button
          onClick={() => setShowKeywords(!showKeywords)}
          className="px-[var(--space-md)] py-[var(--space-sm)] text-[var(--gray-5)] text-[var(--text-xs)] underline transition-all duration-[var(--duration-fast)] hover:text-[var(--accent-primary)]"
        >
          {showKeywords ? "HIDE" : "+KEYWORDS"}
        </button>
        </div>

        {/* Keywords - Hidden by default */}
        {showKeywords && (
          <div className="mt-[var(--space-md)] border-[var(--gray-7)] border-t pt-[var(--space-md)]">
            <div className="flex flex-wrap gap-[var(--space-xs)]">
            {[
              data.rank_4,
              data.rank_5,
              data.rank_6,
              data.rank_7,
              data.rank_8,
              data.rank_9,
              data.rank_10,
            ]
              .filter(Boolean)
              .map((keyword, i) => (
                <span
                  key={i}
                  className="rounded-sm bg-[var(--gray-8)] px-[var(--space-sm)] py-1 text-[var(--gray-4)] text-[var(--text-xs)]"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analysis Modal */}
      <AnalysisModal
        isOpen={isExpanded}
        onClose={handleClose}
        data={data}
        analysis={analysis}
        isLoading={isLoading}
        error={error}
      />
    </article>
  );
});
