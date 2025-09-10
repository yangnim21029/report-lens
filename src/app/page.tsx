"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { RegionFilter } from "~/components/RegionFilter";
import { api } from "~/trpc/react";
import {
	extractAnalysisData,
	formatAsCSV,
	formatAsEmail,
	formatAsMarkdown,
} from "~/utils/analysisExtractor";

export default function HomePage() {
	const [site, setSite] = useState("sc-domain:holidaysmart.io");
	const [expandedRow, setExpandedRow] = useState<number | null>(null);
	const [isMounted, setIsMounted] = useState(false);
	const [hasOpenModal, setHasOpenModal] = useState(false);
	const [selectedRegion, setSelectedRegion] = useState<string>("all");
	const scrollIndicatorRef = useRef<HTMLDivElement>(null);
	const { data, isLoading, error, refetch } = api.search.getSearchData.useQuery(
		{ site },
		{ enabled: false },
	);

	// Stable callback for modal state changes
	const handleModalChange = useCallback((isOpen: boolean) => {
		setHasOpenModal(isOpen);
	}, []);

	// Track scroll progress - only on client
	useEffect(() => {
		setIsMounted(true);

		const handleScroll = () => {
			// Don't update scroll progress if any modal is open
			if (hasOpenModal) return;

			const totalHeight =
				document.documentElement.scrollHeight - window.innerHeight;
			const progress = (window.scrollY / totalHeight) * 100;

			// Directly update CSS variable instead of React state
			if (scrollIndicatorRef.current) {
				scrollIndicatorRef.current.style.setProperty(
					"--scroll-progress",
					`${Math.min(100, Math.max(0, progress))}%`,
				);
			}
		};

		// Only add listener if modal is not open
		if (!hasOpenModal) {
			window.addEventListener("scroll", handleScroll, { passive: true });
		}

		return () => window.removeEventListener("scroll", handleScroll);
	}, [hasOpenModal]);

	// Filter data based on selected region
	const filteredData = useMemo(() => {
		if (!data || selectedRegion === "all") return data || [];
		return data.filter(row => row.page.includes(`/${selectedRegion}/`));
	}, [data, selectedRegion]);

	const handleSearch = () => {
		refetch();
		setExpandedRow(null);
		setSelectedRegion("all"); // Reset filter when searching
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
					ref={scrollIndicatorRef}
					className="scroll-indicator"
					style={{ "--scroll-progress": "0%" } as React.CSSProperties}
				/>
			)}

			<main className="min-h-screen">
				{/* Navigation */}
				<nav className="container mx-auto px-[var(--space-lg)] py-[var(--space-md)]">
					<div className="flex justify-between items-center">
						<Link href="/" className="font-black text-[var(--ink)] text-[var(--text-lg)]">
							REPOSTLENS
						</Link>
						<div className="flex gap-[var(--space-md)]">
							<Link 
								href="/custom" 
								className="text-[var(--gray-4)] hover:text-[var(--accent-primary)] transition-colors font-bold text-[var(--text-sm)] uppercase"
							>
								CSV Upload
							</Link>
						</div>
					</div>
				</nav>

				{/* Hero Section - Typography as Interface */}
				<section className="noise relative flex min-h-[70vh] items-center justify-center overflow-hidden">
					{/* Animated Background Elements */}
					<div className="absolute inset-0 opacity-5">
						<div className="absolute top-1/4 left-1/4 animate-float select-none font-black text-[20rem] text-[var(--ink)]">
							SEO
						</div>
						<div className="absolute right-1/4 bottom-1/4 animate-pulse-slow select-none font-black text-[15rem] text-[var(--ink)]">
							DATA
						</div>
					</div>

					{/* Main Content */}
					<div className="container relative z-10 mx-auto px-[var(--space-lg)] text-center">
						<h1 className="mb-[var(--space-xl)] text-editorial">
							<span className="mb-2 block font-normal text-[var(--gray-4)] text-[var(--text-3xl)]">
								REPOST
							</span>
							<span className="block text-[var(--accent-primary)] text-[var(--text-display)]">
								LENS
							</span>
						</h1>

						<p className="mx-auto mb-[var(--space-xl)] max-w-2xl text-balance text-[var(--gray-3)] text-[var(--text-lg)]">
							Semantic Hijacking for Search Dominance
						</p>

						{/* Search Interface */}
						<div className="relative mx-auto max-w-3xl">
							<div className="flex flex-col gap-[var(--space-md)] sm:flex-row">
								<input
									type="text"
									value={site}
									onChange={(e) => setSite(e.target.value)}
									onKeyPress={handleKeyPress}
									className="flex-1 border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-lg)] py-[var(--space-md)] font-bold text-[var(--ink)] text-[var(--text-xl)] transition-all duration-[var(--duration-normal)] placeholder:text-[var(--gray-5)] focus:border-[var(--accent-primary)] focus:outline-none"
									placeholder="Domain to analyze..."
								/>
								<button
									onClick={handleSearch}
									disabled={isLoading}
									className="btn-brutal min-w-[150px] disabled:cursor-not-allowed disabled:opacity-50"
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
						<div className="paper-effect border-[var(--accent-primary)] border-l-4 p-[var(--space-lg)]">
							<p className="font-bold text-[var(--accent-primary)]">
								Analysis Error
							</p>
							<p className="mt-2 text-[var(--gray-3)]">{error.message}</p>
						</div>
					</div>
				)}

				{/* Results Section */}
				{data && data.length > 0 ? (
					<section className="container mx-auto px-[var(--space-lg)] py-[var(--space-xl)]">
						<div className="mb-[var(--space-lg)]">
							<h2 className="mb-[var(--space-sm)] font-black text-[var(--ink)] text-[var(--text-2xl)]">
								SEMANTIC OPPORTUNITIES
							</h2>
							<p className="text-[var(--gray-4)]">
								{filteredData.length} of {data.length} pages with hijacking potential
							</p>
						</div>

						{/* Region Filter */}
						<RegionFilter 
							data={data}
							selectedRegion={selectedRegion}
							onRegionChange={setSelectedRegion}
						/>

						{/* Data Grid - Cards Layout */}
						<div className="grid-editorial">
							{filteredData.map((row, index) => (
								<DataCard
									key={index}
									data={row}
									onModalChange={handleModalChange}
								/>
							))}
						</div>
					</section>
				) : data && data.length === 0 ? (
					<div className="container mx-auto px-[var(--space-lg)] py-[var(--space-xl)]">
						<div className="text-center">
							<p className="text-[var(--gray-4)] text-[var(--text-xl)]">
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
					className="bg-[var(--gray-7)] px-[var(--space-sm)] py-[var(--space-xs)] font-medium text-[var(--gray-3)] text-[var(--text-xs)] uppercase tracking-wider"
				>
					{keyword}
				</span>
			))}
			{hasMore && (
				<button
					onClick={() => setShowAll(!showAll)}
					className="font-bold text-[var(--accent-primary)] text-[var(--text-xs)] uppercase hover:underline"
				>
					{showAll ? "← Show Less" : `+${keywords.length - MAX_VISIBLE} More →`}
				</button>
			)}
		</div>
	);
}

// Data Card Component
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
		api.optimize.generateAIEmail.useMutation({
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
						content = formatAsCSV(extractedData);
						break;
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
				pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

			// Remove query parameters and clean up
			const cleanPart = lastPart.split("?")[0].split("#")[0];

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
								<span className="text-[var(--gray-5)] text-[var(--text-xs)]">
									#
								</span>
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
					<Link
						href={data.page}
						target="_blank"
						rel="noopener noreferrer"
						className="mb-[var(--space-xs)] block truncate text-[var(--gray-5)] text-[var(--text-xs)] transition-colors hover:text-[var(--accent-primary)]"
						title={data.page}
					>
						{formatUrl(data.page)}
					</Link>
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
								{copiedFormat === "csv" ? "✓" : "CSV"}
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
