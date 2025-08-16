"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  analysis: any;
  isLoading: boolean;
  error: any;
}

export function AnalysisModal({ isOpen, onClose, data, analysis, isLoading, error }: AnalysisModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"semantic" | "structure" | "implementation">("semantic");

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab("semantic");
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Don't render anything if not mounted or not open
  if (!mounted || !isOpen) return null;

  const getTabContent = () => {
    if (!analysis) return "";
    switch (activeTab) {
      case "semantic":
        return analysis.sections.quickWins || "No semantic analysis";
      case "structure":
        return analysis.sections.paragraphAdditions || "No structure suggestions";
      case "implementation":
        return analysis.sections.structuralChanges || "No implementation plan";
    }
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[var(--z-modal)] bg-black/70 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[calc(var(--z-modal)+1)] 
                    w-[min(90vw,1200px)] h-[min(85vh,800px)] 
                    bg-[var(--paper)] shadow-2xl overflow-hidden flex flex-col animate-fade-in">
        {/* Header Bar - Brutalist Style */}
        <div className="bg-[var(--ink)] text-[var(--paper)] px-[var(--space-xl)] py-[var(--space-lg)]">
          <div className="flex items-start justify-between gap-[var(--space-lg)]">
            <div className="flex-1">
              <h2 className="text-[var(--text-2xl)] font-black uppercase tracking-tight mb-[var(--space-xs)]">
                {data.best_query || "SEMANTIC ANALYSIS"}
              </h2>
              <a
                href={data.page}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--gray-6)] text-[var(--text-sm)] hover:text-[var(--accent-primary)] 
                         transition-colors duration-[var(--duration-fast)] break-all line-clamp-1"
              >
                {data.page}
              </a>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--paper)] hover:text-[var(--accent-primary)] 
                       transition-all duration-[var(--duration-fast)] p-2 -mr-2
                       hover:rotate-90 transform"
              aria-label="Close modal"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="inline-block animate-spin text-[var(--text-3xl)]">⟳</span>
                <p className="text-[var(--gray-5)] mt-4">Analyzing semantic opportunities...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[var(--text-xl)] text-[var(--accent-primary)]">Analysis Error</p>
                <p className="text-[var(--gray-4)] mt-2">{error.message}</p>
              </div>
            </div>
          ) : analysis ? (
            <>
              {/* Tab Navigation - Brutalist Style */}
              <div className="bg-[var(--gray-8)] border-b-4 border-[var(--ink)]">
                <div className="flex px-[var(--space-xl)]">
                  <button
                    onClick={() => setActiveTab("semantic")}
                    className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight
                             transition-all duration-[var(--duration-fast)]
                             ${activeTab === "semantic" 
                               ? "bg-[var(--paper)] text-[var(--accent-primary)]" 
                               : "text-[var(--gray-4)] hover:text-[var(--ink)] hover:bg-[var(--gray-7)]"}`}
                  >
                    SEMANTIC
                    {activeTab === "semantic" && (
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)]"></span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("structure")}
                    className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight
                             transition-all duration-[var(--duration-fast)]
                             ${activeTab === "structure" 
                               ? "bg-[var(--paper)] text-[var(--accent-primary)]" 
                               : "text-[var(--gray-4)] hover:text-[var(--ink)] hover:bg-[var(--gray-7)]"}`}
                  >
                    STRATEGY
                    {activeTab === "structure" && (
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)]"></span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("implementation")}
                    className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight
                             transition-all duration-[var(--duration-fast)]
                             ${activeTab === "implementation" 
                               ? "bg-[var(--paper)] text-[var(--accent-primary)]" 
                               : "text-[var(--gray-4)] hover:text-[var(--ink)] hover:bg-[var(--gray-7)]"}`}
                  >
                    EXECUTE
                    {activeTab === "implementation" && (
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)]"></span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tab Content - Scrollable */}
              <div className="flex-1 overflow-y-auto px-[var(--space-xl)] py-[var(--space-lg)] bg-[var(--paper)]">
                <div className="max-w-4xl mx-auto">
                  <div className="whitespace-pre-wrap text-[var(--text-base)] text-[var(--gray-2)] leading-relaxed">
                    {getTabContent().split('\n').map((line, i) => {
                      // Format headers
                      if (line.startsWith('###')) {
                        return <h4 key={i} className="text-[var(--text-lg)] font-bold mt-6 mb-3 text-[var(--ink)]">{line.replace(/^###\s*/, '')}</h4>;
                      }
                      if (line.startsWith('##')) {
                        return <h3 key={i} className="text-[var(--text-xl)] font-black mt-8 mb-4 text-[var(--accent-primary)] uppercase">{line.replace(/^##\s*/, '')}</h3>;
                      }
                      // Format list items
                      if (line.startsWith('- ')) {
                        return <li key={i} className="ml-6 mb-2 list-disc text-[var(--gray-2)]">{line.replace(/^-\s*/, '')}</li>;
                      }
                      // Format numbered items
                      if (line.match(/^\d+\.\s/)) {
                        return <li key={i} className="ml-6 mb-2 list-decimal text-[var(--gray-2)]">{line.replace(/^\d+\.\s*/, '')}</li>;
                      }
                      // Bold text
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <p key={i} className="font-bold text-[var(--ink)] my-3">{line.replace(/^\*\*|\*\*$/g, '')}</p>;
                      }
                      // Regular text
                      return line.trim() ? <p key={i} className="mb-3">{line}</p> : <br key={i} />;
                    })}
                  </div>
                </div>

                {/* Keywords Analyzed Badge */}
                {analysis.keywordsAnalyzed > 0 && (
                  <div className="mt-[var(--space-xl)] pt-[var(--space-lg)] border-t-2 border-[var(--gray-7)] max-w-4xl mx-auto">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-sm)] text-[var(--gray-5)] uppercase tracking-wider font-bold">
                        {analysis.keywordsAnalyzed} KEYWORDS ANALYZED
                      </span>
                      <span className="text-[var(--text-xs)] text-[var(--gray-6)]">
                        {new Date().toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}