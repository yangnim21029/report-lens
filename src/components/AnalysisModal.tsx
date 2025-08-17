"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Create portal container once at module level
let portalRoot: HTMLElement | null = null;
if (typeof document !== "undefined") {
	portalRoot = document.getElementById("modal-root");
	if (!portalRoot) {
		portalRoot = document.createElement("div");
		portalRoot.id = "modal-root";
		portalRoot.style.position = "fixed";
		portalRoot.style.zIndex = "9999";
		portalRoot.style.pointerEvents = "none";
		document.body.appendChild(portalRoot);
	}
}

interface AnalysisModalProps {
	isOpen: boolean;
	onClose: () => void;
	data: any;
	analysis: any;
	isLoading: boolean;
	error: any;
}

function AnalysisModalComponent({
	isOpen,
	onClose,
	data,
	analysis,
	isLoading,
	error,
}: AnalysisModalProps) {
	const [activeTab, setActiveTab] = useState<
		"semantic" | "structure" | "implementation" | "raw"
	>("semantic");

	// Reset tab when modal opens
	useEffect(() => {
		if (isOpen) {
			setActiveTab("semantic");
		}
	}, [isOpen]);

	// Prevent body scroll when modal is open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isOpen]);

	// Don't render anything if not open or no portal root
	if (!isOpen || !portalRoot) return null;

	const getTabContent = () => {
		if (!analysis) return "";
		switch (activeTab) {
			case "semantic":
				return analysis.sections.quickWins || "No semantic analysis";
			case "structure":
				return (
					analysis.sections.paragraphAdditions || "No structure suggestions"
				);
			case "implementation":
				return analysis.sections.structuralChanges || "No implementation plan";
			case "raw":
				return (
					analysis.sections.rawAnalysis ||
					analysis.analysis ||
					"No raw analysis available"
				);
		}
	};

	const modalContent = (
		<div style={{ pointerEvents: "auto", isolation: "isolate" }}>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-[var(--z-modal)] animate-fade-in bg-black/70 backdrop-blur-md"
				onClick={onClose}
				onScroll={(e) => e.stopPropagation()}
				style={{ contain: "layout style" }}
			/>

			{/* Modal Content */}
			<div
				className="fixed top-1/2 left-1/2 z-[calc(var(--z-modal)+1)] flex h-[min(85vh,800px)] w-[min(90vw,1200px)] flex-col overflow-hidden bg-[var(--paper)] shadow-2xl"
				style={{
					transform: "translate(-50%, -50%) translateZ(0)",
					willChange: "transform",
				}}
			>
				{/* Header Bar - Brutalist Style */}
				<div className="bg-[var(--ink)] px-[var(--space-xl)] py-[var(--space-lg)] text-[var(--paper)]">
					<div className="flex items-start justify-between gap-[var(--space-lg)]">
						<div className="flex-1">
							<h2 className="mb-[var(--space-xs)] font-black text-[var(--text-2xl)] uppercase tracking-tight">
								{data.best_query || "SEMANTIC ANALYSIS"}
							</h2>
							<a
								href={data.page}
								target="_blank"
								rel="noopener noreferrer"
								className="line-clamp-1 break-all text-[var(--gray-6)] text-[var(--text-sm)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--accent-primary)]"
							>
								{data.page}
							</a>
						</div>
						<button
							onClick={onClose}
							className="-mr-2 transform p-2 text-[var(--paper)] transition-all duration-[var(--duration-fast)] hover:rotate-90 hover:text-[var(--accent-primary)]"
							aria-label="Close modal"
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="3"
							>
								<line x1="18" y1="6" x2="6" y2="18"></line>
								<line x1="6" y1="6" x2="18" y2="18"></line>
							</svg>
						</button>
					</div>
				</div>

				{/* Content Container */}
				<div className="flex flex-1 flex-col overflow-hidden">
					{isLoading ? (
						<div className="flex h-full items-center justify-center">
							<div className="text-center">
								<span className="inline-block animate-spin text-[var(--text-3xl)]">
									⟳
								</span>
								<p className="mt-4 text-[var(--gray-5)]">
									Analyzing semantic opportunities...
								</p>
							</div>
						</div>
					) : error ? (
						<div className="flex h-full items-center justify-center">
							<div className="text-center">
								<p className="text-[var(--accent-primary)] text-[var(--text-xl)]">
									Analysis Error
								</p>
								<p className="mt-2 text-[var(--gray-4)]">{error.message}</p>
							</div>
						</div>
					) : analysis ? (
						<>
							{/* Tab Navigation - Brutalist Style */}
							<div className="border-[var(--ink)] border-b-4 bg-[var(--gray-8)]">
								<div className="flex px-[var(--space-xl)]">
									<button
										onClick={() => setActiveTab("semantic")}
										className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight transition-all duration-[var(--duration-fast)] ${
											activeTab === "semantic"
												? "bg-[var(--paper)] text-[var(--accent-primary)]"
												: "text-[var(--gray-4)] hover:bg-[var(--gray-7)] hover:text-[var(--ink)]"
										}`}
									>
										SEMANTIC
										{activeTab === "semantic" && (
											<span className="absolute right-0 bottom-0 left-0 h-1 bg-[var(--accent-primary)]"></span>
										)}
									</button>
									<button
										onClick={() => setActiveTab("structure")}
										className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight transition-all duration-[var(--duration-fast)] ${
											activeTab === "structure"
												? "bg-[var(--paper)] text-[var(--accent-primary)]"
												: "text-[var(--gray-4)] hover:bg-[var(--gray-7)] hover:text-[var(--ink)]"
										}`}
									>
										STRATEGY
										{activeTab === "structure" && (
											<span className="absolute right-0 bottom-0 left-0 h-1 bg-[var(--accent-primary)]"></span>
										)}
									</button>
									<button
										onClick={() => setActiveTab("implementation")}
										className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight transition-all duration-[var(--duration-fast)] ${
											activeTab === "implementation"
												? "bg-[var(--paper)] text-[var(--accent-primary)]"
												: "text-[var(--gray-4)] hover:bg-[var(--gray-7)] hover:text-[var(--ink)]"
										}`}
									>
										EXECUTE
										{activeTab === "implementation" && (
											<span className="absolute right-0 bottom-0 left-0 h-1 bg-[var(--accent-primary)]"></span>
										)}
									</button>
									<button
										onClick={() => setActiveTab("raw")}
										className={`relative px-[var(--space-xl)] py-[var(--space-lg)] font-black text-[var(--text-lg)] uppercase tracking-tight transition-all duration-[var(--duration-fast)] ${
											activeTab === "raw"
												? "bg-[var(--paper)] text-[var(--accent-primary)]"
												: "text-[var(--gray-4)] hover:bg-[var(--gray-7)] hover:text-[var(--ink)]"
										}`}
									>
										RAW
										{activeTab === "raw" && (
											<span className="absolute right-0 bottom-0 left-0 h-1 bg-[var(--accent-primary)]"></span>
										)}
									</button>
								</div>
							</div>

							{/* Tab Content - Scrollable */}
							<div
								className="flex-1 overflow-y-auto bg-[var(--paper)] px-[var(--space-xl)] py-[var(--space-lg)]"
								onScroll={(e) => e.stopPropagation()}
							>
								<div className="mx-auto max-w-4xl">
									<div className="whitespace-pre-wrap text-[var(--gray-2)] text-[var(--text-base)] leading-relaxed">
										{getTabContent()
											.split("\n")
											.map((line, i) => {
												// Format headers
												if (line.startsWith("###")) {
													return (
														<h4
															key={i}
															className="mt-6 mb-3 font-bold text-[var(--ink)] text-[var(--text-lg)]"
														>
															{line.replace(/^###\s*/, "")}
														</h4>
													);
												}
												if (line.startsWith("##")) {
													return (
														<h3
															key={i}
															className="mt-8 mb-4 font-black text-[var(--accent-primary)] text-[var(--text-xl)] uppercase"
														>
															{line.replace(/^##\s*/, "")}
														</h3>
													);
												}
												// Format list items
												if (line.startsWith("- ")) {
													return (
														<li
															key={i}
															className="mb-2 ml-6 list-disc text-[var(--gray-2)]"
														>
															{line.replace(/^-\s*/, "")}
														</li>
													);
												}
												// Format numbered items
												if (line.match(/^\d+\.\s/)) {
													return (
														<li
															key={i}
															className="mb-2 ml-6 list-decimal text-[var(--gray-2)]"
														>
															{line.replace(/^\d+\.\s*/, "")}
														</li>
													);
												}
												// Bold text
												if (line.startsWith("**") && line.endsWith("**")) {
													return (
														<p
															key={i}
															className="my-3 font-bold text-[var(--ink)]"
														>
															{line.replace(/^\*\*|\*\*$/g, "")}
														</p>
													);
												}
												// Regular text
												return line.trim() ? (
													<p key={i} className="mb-3">
														{line}
													</p>
												) : (
													<br key={i} />
												);
											})}
									</div>
								</div>

								{/* Keywords Analyzed Badge */}
								{analysis.keywordsAnalyzed > 0 && (
									<div className="mx-auto mt-[var(--space-xl)] max-w-4xl border-[var(--gray-7)] border-t-2 pt-[var(--space-lg)]">
										<div className="flex items-center justify-between">
											<span className="font-bold text-[var(--gray-5)] text-[var(--text-sm)] uppercase tracking-wider">
												{analysis.keywordsAnalyzed} KEYWORDS ANALYZED
											</span>
											<span className="text-[var(--gray-6)] text-[var(--text-xs)]">
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
		</div>
	);

	return createPortal(modalContent, portalRoot);
}

// Export memoized component to prevent unnecessary re-renders
export const AnalysisModal = memo(
	AnalysisModalComponent,
	(prevProps, nextProps) => {
		// Only re-render if these specific props change
		return (
			prevProps.isOpen === nextProps.isOpen &&
			prevProps.analysis === nextProps.analysis &&
			prevProps.isLoading === nextProps.isLoading &&
			prevProps.error === nextProps.error &&
			prevProps.data?.page === nextProps.data?.page
		);
	},
);
