"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { extractAnalysisData, formatAsMarkdown, formatAsCSV, formatAsEmail } from "~/utils/analysisExtractor";

export default function HomePage() {
  const [site, setSite] = useState("sc-domain:holidaysmart.io");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const { data, isLoading, error, refetch } = api.search.getSearchData.useQuery(
    { site },
    { enabled: false }
  );

  // Track scroll progress - only on client
  useEffect(() => {
    setIsMounted(true);
    
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(Math.min(100, Math.max(0, progress)));
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearch = () => {
    refetch();
    setExpandedRow(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <>
      {/* Scroll Progress Indicator - Only render on client */}
      {isMounted && (
        <div 
          className="scroll-indicator"
          style={{ "--scroll-progress": `${scrollProgress}%` } as React.CSSProperties}
        />
      )}

      <main className="min-h-screen">
        {/* Hero Section - Typography as Interface */}
        <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden noise">
          {/* Animated Background Elements */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-1/4 left-1/4 text-[20rem] font-black text-[var(--ink)] animate-float select-none">
              SEO
            </div>
            <div className="absolute bottom-1/4 right-1/4 text-[15rem] font-black text-[var(--ink)] animate-pulse-slow select-none">
              DATA
            </div>
          </div>

          {/* Main Content */}
          <div className="relative z-10 container mx-auto px-[var(--space-lg)] text-center">
            <h1 className="text-editorial mb-[var(--space-xl)]">
              <span className="block text-[var(--text-3xl)] text-[var(--gray-4)] font-normal mb-2">
                REPOST
              </span>
              <span className="block text-[var(--text-display)] text-[var(--accent-primary)]">
                LENS
              </span>
            </h1>

            <p className="text-[var(--text-lg)] text-[var(--gray-3)] max-w-2xl mx-auto mb-[var(--space-xl)] text-balance">
              Semantic Hijacking for Search Dominance
            </p>

            {/* Search Interface */}
            <div className="relative max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
                <input
                  type="text"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 px-[var(--space-lg)] py-[var(--space-md)] bg-transparent border-b-3 border-[var(--gray-6)] 
                           text-[var(--text-xl)] font-bold text-[var(--ink)] placeholder:text-[var(--gray-5)]
                           focus:border-[var(--accent-primary)] focus:outline-none transition-all duration-[var(--duration-normal)]"
                  placeholder="Domain to analyze..."
                />
                <button
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="btn-brutal min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="inline-block animate-spin">⟳</span>
                  ) : (
                    "ANALYZE"
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Error State */}
        {error && (
          <div className="container mx-auto px-[var(--space-lg)] py-[var(--space-md)]">
            <div className="paper-effect p-[var(--space-lg)] border-l-4 border-[var(--accent-primary)]">
              <p className="text-[var(--accent-primary)] font-bold">Analysis Error</p>
              <p className="text-[var(--gray-3)] mt-2">{error.message}</p>
            </div>
          </div>
        )}

        {/* Results Section */}
        {data && data.length > 0 ? (
          <section className="container mx-auto px-[var(--space-lg)] py-[var(--space-xl)]">
            <div className="mb-[var(--space-lg)]">
              <h2 className="text-[var(--text-2xl)] font-black text-[var(--ink)] mb-[var(--space-sm)]">
                SEMANTIC OPPORTUNITIES
              </h2>
              <p className="text-[var(--gray-4)]">
                {data.length} pages with hijacking potential
              </p>
            </div>

            {/* Data Grid - Cards Layout */}
            <div className="grid-editorial">
              {data.map((row, index) => (
                <DataCard key={index} data={row} index={index} />
              ))}
            </div>
          </section>
        ) : data && data.length === 0 ? (
          <div className="container mx-auto px-[var(--space-lg)] py-[var(--space-xl)]">
            <div className="text-center">
              <p className="text-[var(--text-xl)] text-[var(--gray-4)]">
                No data found. Adjust your search criteria.
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

// Keywords Display Component
function KeywordsDisplay({ keywords }: { keywords: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const MAX_VISIBLE = 3;
  
  if (keywords.length === 0) return null;
  
  const visibleKeywords = showAll ? keywords : keywords.slice(0, MAX_VISIBLE);
  const hasMore = keywords.length > MAX_VISIBLE;
  
  return (
    <div className="flex flex-wrap items-center gap-[var(--space-xs)]">
      {visibleKeywords.map((keyword, i) => (
        <span 
          key={i}
          className="px-[var(--space-sm)] py-[var(--space-xs)] bg-[var(--gray-7)] text-[var(--gray-3)] 
                   text-[var(--text-xs)] font-medium uppercase tracking-wider"
        >
          {keyword}
        </span>
      ))}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[var(--text-xs)] text-[var(--accent-primary)] font-bold uppercase hover:underline"
        >
          {showAll ? '← Show Less' : `+${keywords.length - MAX_VISIBLE} More →`}
        </button>
      )}
    </div>
  );
}

// Data Card Component
function DataCard({ data, index }: { data: any; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [isSendingToChat, setIsSendingToChat] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  
  const { mutate: analyzeContent, data: analysis, isPending: isLoading, error } = 
    api.optimize.analyzeContent.useMutation();
  
  const { mutate: sendToChat } = api.chat.sendAnalysisToChat.useMutation({
    onMutate: () => {
      setIsSendingToChat(true);
    },
    onSuccess: (result) => {
      if (result.success) {
        alert('Analysis sent to Google Chat successfully!');
      } else {
        alert(`Failed to send to Chat: ${result.error}`);
      }
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
    onSettled: () => {
      setIsSendingToChat(false);
    }
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
    setIsExpanded(true);
  }, [hasAnalyzed, isLoading, analyzeContent, data]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
  }, []);
  
  const handleSendToChat = useCallback(() => {
    if (analysis && analysis.analysis) {
      sendToChat({
        analysis: analysis.analysis,
        pageData: {
          page: data.page,
          best_query: data.best_query || ''
        }
      });
    }
  }, [analysis, sendToChat, data]);
  
  const handleCopyToClipboard = useCallback(async (format: 'markdown' | 'csv' | 'email') => {
    if (!analysis || !analysis.analysis) return;
    
    try {
      const extractedData = extractAnalysisData(analysis.analysis, {
        page: data.page,
        best_query: data.best_query || ''
      });
      
      let content = '';
      switch (format) {
        case 'markdown':
          content = formatAsMarkdown(extractedData);
          break;
        case 'csv':
          content = formatAsCSV(extractedData);
          break;
        case 'email':
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
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
  }, [analysis, data]);

  // Get click intensity for visual indicator
  const clickIntensity = Math.min(100, (data.best_query_clicks || 0) / 10);
  
  // Format URL for display
  const formatUrl = (url: string) => {
    try {
      const decoded = decodeURIComponent(url);
      const pathParts = decoded.split('/');
      const lastPart = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      
      // Remove query parameters and clean up
      const cleanPart = lastPart.split('?')[0].split('#')[0];
      
      // Add ellipsis if too long
      if (cleanPart.length > 25) {
        return cleanPart.substring(0, 22) + '...';
      }
      return cleanPart;
    } catch {
      // Fallback if decode fails
      const parts = url.split('/');
      const last = parts[parts.length - 1] || 'homepage';
      return last.length > 25 ? last.substring(0, 22) + '...' : last;
    }
  };

  return (
    <article className="group bg-white border border-[var(--gray-7)] hover:border-[var(--gray-4)] 
                       transition-all duration-[var(--duration-normal)] relative">
      {/* Click intensity indicator - subtle left border */}
      <div 
        className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-[var(--accent-primary)] to-transparent"
        style={{ opacity: Math.min(1, clickIntensity / 100 + 0.3) }}
      />

      <div className="p-[var(--space-lg)]">
        {/* Header: Query and Clicks */}
        <div className="mb-[var(--space-md)]">
          {data.best_query && (
            <div className="flex items-start justify-between gap-[var(--space-sm)] mb-[var(--space-xs)]">
              <h3 className="text-[var(--text-lg)] font-bold text-[var(--ink)] 
                           line-clamp-2 group-hover:text-[var(--accent-primary)] transition-colors flex-1">
                {data.best_query}
              </h3>
              {data.potential_traffic && (
                <span className="text-[var(--text-xs)] px-[var(--space-sm)] py-1 
                               bg-[var(--accent-primary)] text-[var(--paper)] rounded-sm font-bold"
                      title="Potential traffic if optimized">
                  🎯 {Math.round(data.potential_traffic)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-[var(--space-md)]">
            <div className="flex items-baseline gap-[var(--space-xs)]">
              <span className="text-[var(--text-xl)] font-black text-[var(--accent-primary)]">
                {data.best_query_clicks || 0}
              </span>
              <span className="text-[var(--text-xs)] text-[var(--gray-5)] uppercase">clicks</span>
            </div>
            {data.best_query_position && (
              <div className="flex items-center gap-[var(--space-xs)] px-[var(--space-sm)] py-1 
                           bg-[var(--gray-8)] rounded-sm">
                <span className="text-[var(--text-xs)] text-[var(--gray-5)]">#</span>
                <span className="text-[var(--text-sm)] font-bold text-[var(--gray-3)]">
                  {data.best_query_position.toFixed(1)}
                </span>
                {data.position_change !== null && data.position_change !== undefined && (
                  <span className={`text-[var(--text-xs)] font-bold ml-1 ${
                    data.position_change > 0 ? 'text-green-500' : 
                    data.position_change < 0 ? 'text-red-500' : 'text-[var(--gray-5)]'
                  }`}>
                    {data.position_change > 0 ? '↑' : data.position_change < 0 ? '↓' : '-'}
                    {Math.abs(data.position_change).toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* URL with Link and Stats - Properly formatted */}
        <div className="mb-[var(--space-md)]">
          <Link 
            href={data.page}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[var(--text-xs)] text-[var(--gray-5)] mb-[var(--space-xs)] 
                     hover:text-[var(--accent-primary)] transition-colors truncate"
            title={data.page}
          >
            {formatUrl(data.page)}
          </Link>
          {/* Stats bar */}
          <div className="flex items-center gap-[var(--space-md)] text-[var(--text-xs)] text-[var(--gray-5)]">
            {data.keywords_4to10_count !== null && data.total_keywords !== null && (
              <span title="Keywords ranking 4-10 / Total keywords">
                🎯 {data.keywords_4to10_count}/{data.total_keywords} words
              </span>
            )}
            {data.keywords_4to10_ratio !== null && (
              <span title="Percentage of keywords ranking 4-10">
                📈 {data.keywords_4to10_ratio}
              </span>
            )}
            {data.prev_best_query && data.prev_best_query !== data.best_query && (
              <span title="Previous best query" className="text-[var(--gray-6)] italic">
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
            className="flex-1 py-[var(--space-sm)] px-[var(--space-md)] 
                     border-2 border-[var(--ink)] text-[var(--ink)] bg-transparent
                     text-[var(--text-sm)] font-bold uppercase 
                     hover:bg-[var(--ink)] hover:text-[var(--paper)] 
                     transition-all duration-[var(--duration-fast)] disabled:opacity-50"
          >
            {isLoading ? "LOADING..." : "ANALYZE"}
          </button>
          
          {analysis && (
            <div className="flex gap-[var(--space-xs)]">
              <button
                onClick={() => handleCopyToClipboard('markdown')}
                className="px-[var(--space-sm)] py-[var(--space-sm)] 
                         border border-[var(--gray-5)] text-[var(--gray-3)] bg-transparent
                         text-[var(--text-xs)] font-bold uppercase 
                         hover:bg-[var(--gray-8)] hover:border-[var(--gray-4)]
                         transition-all duration-[var(--duration-fast)]"
                title="Copy as Markdown"
              >
                {copiedFormat === 'markdown' ? '✓' : 'MD'}
              </button>
              <button
                onClick={() => handleCopyToClipboard('csv')}
                className="px-[var(--space-sm)] py-[var(--space-sm)] 
                         border border-[var(--gray-5)] text-[var(--gray-3)] bg-transparent
                         text-[var(--text-xs)] font-bold uppercase 
                         hover:bg-[var(--gray-8)] hover:border-[var(--gray-4)]
                         transition-all duration-[var(--duration-fast)]"
                title="Copy as CSV"
              >
                {copiedFormat === 'csv' ? '✓' : 'CSV'}
              </button>
              <button
                onClick={() => handleCopyToClipboard('email')}
                className="px-[var(--space-sm)] py-[var(--space-sm)] 
                         border border-[var(--gray-5)] text-[var(--gray-3)] bg-transparent
                         text-[var(--text-xs)] font-bold uppercase 
                         hover:bg-[var(--gray-8)] hover:border-[var(--gray-4)]
                         transition-all duration-[var(--duration-fast)]"
                title="Copy as Email"
              >
                {copiedFormat === 'email' ? '✓' : '✉'}
              </button>
            </div>
          )}
          
          <button
            onClick={() => setShowKeywords(!showKeywords)}
            className="py-[var(--space-sm)] px-[var(--space-md)] 
                     text-[var(--text-xs)] text-[var(--gray-5)] hover:text-[var(--accent-primary)] 
                     transition-all duration-[var(--duration-fast)] underline"
          >
            {showKeywords ? "HIDE" : "+KEYWORDS"}
          </button>
        </div>

        {/* Keywords - Hidden by default */}
        {showKeywords && (
          <div className="mt-[var(--space-md)] pt-[var(--space-md)] border-t border-[var(--gray-7)]">
            <div className="flex flex-wrap gap-[var(--space-xs)]">
              {[data.rank_4, data.rank_5, data.rank_6, data.rank_7, data.rank_8, data.rank_9, data.rank_10]
                .filter(Boolean)
                .map((keyword, i) => (
                  <span 
                    key={i}
                    className="px-[var(--space-sm)] py-1 bg-[var(--gray-8)] text-[var(--gray-4)] 
                             text-[var(--text-xs)] rounded-sm"
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
}