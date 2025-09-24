"use client";

import { memo } from "react";

interface DataCardActionsProps {
  isLoading: boolean;
  hasAnalysis: boolean;
  onAnalyze: () => void;
  onCopy: (format: "markdown" | "csv" | "email") => void | Promise<void>;
  copiedFormat: string | null;
  isGeneratingContext: boolean;
  isGeneratingEmail: boolean;
  contextVectorError: string | null;
  showKeywords: boolean;
  onToggleKeywords: () => void;
  onGenerateMeta?: () => void;
  isGeneratingMeta?: boolean;
  canGenerateMeta?: boolean;
  hasMetaResult?: boolean;
}

export const DataCardActions = memo(function DataCardActions({
  isLoading,
  hasAnalysis,
  onAnalyze,
  onCopy,
  copiedFormat,
  isGeneratingContext,
  isGeneratingEmail,
  contextVectorError,
  showKeywords,
  onToggleKeywords,
  onGenerateMeta,
  isGeneratingMeta,
  canGenerateMeta,
  hasMetaResult,
}: DataCardActionsProps) {
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <div className="flex items-center gap-[var(--space-sm)]">
        <button
          onClick={onAnalyze}
          disabled={isLoading}
          className="flex-1 border-2 border-[var(--ink)] bg-transparent px-[var(--space-md)] py-[var(--space-sm)] font-bold text-[var(--ink)] text-[var(--text-sm)] uppercase transition-all duration-[var(--duration-fast)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
        >
          {isLoading ? "LOADING..." : "ANALYZE"}
        </button>

        {onGenerateMeta && (
          <button
            onClick={onGenerateMeta}
            disabled={!canGenerateMeta || Boolean(isGeneratingMeta)}
            className="border-2 border-[var(--accent-primary)] bg-transparent px-[var(--space-md)] py-[var(--space-sm)] font-bold text-[var(--accent-primary)] text-[var(--text-xs)] uppercase tracking-wide transition-all duration-[var(--duration-fast)] hover:bg-[var(--accent-primary)] hover:text-[var(--paper)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGeneratingMeta ? "生成中..." : hasMetaResult ? "再次生成" : "生成標題提案"}
          </button>
        )}

        {hasAnalysis && (
          <div className="flex gap-[var(--space-xs)]">
            <button
              onClick={() => onCopy("markdown")}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)]"
              title="Copy as Markdown"
            >
              {copiedFormat === "markdown" ? "✓" : "MD"}
            </button>
            <button
              onClick={() => onCopy("csv")}
              disabled={isGeneratingContext}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy context vector table"
            >
              {isGeneratingContext ? "..." : copiedFormat === "csv" ? "✓" : "CSV"}
            </button>
            <button
              onClick={() => onCopy("email")}
              disabled={isGeneratingEmail || isGeneratingContext}
              className="border border-[var(--gray-5)] bg-transparent px-[var(--space-sm)] py-[var(--space-sm)] font-bold text-[var(--gray-3)] text-[var(--text-xs)] uppercase transition-all duration-[var(--duration-fast)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-8)] disabled:opacity-50 disabled:cursor-not-allowed"
              title={isGeneratingEmail || isGeneratingContext ? "Building email layout..." : "Copy as Email (AI Enhanced)"}
            >
              {isGeneratingEmail || isGeneratingContext ? "..." : copiedFormat === "email" ? "✓" : "✉"}
            </button>
          </div>
        )}
      </div>

      {contextVectorError && (
        <div className="text-red-500 text-[var(--text-xxs)]">{contextVectorError}</div>
      )}

      <button
        onClick={onToggleKeywords}
        className="px-[var(--space-md)] py-[var(--space-sm)] text-[var(--gray-5)] text-[var(--text-xs)] underline transition-all duration-[var(--duration-fast)] hover:text-[var(--accent-primary)]"
      >
        {showKeywords ? "HIDE" : "+KEYWORDS"}
      </button>
    </div>
  );
});
