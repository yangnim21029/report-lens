"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AnalysisModal } from "~/components/AnalysisModal";
import { DataCard } from "~/components/DataCard";
import { RegionFilter } from "~/components/RegionFilter";
import {
	extractAnalysisData,
	formatAsCSV,
	formatAsEmail,
	formatAsMarkdown,
} from "~/utils/extract-format-html";

export default function HomePage() {
	const [site, setSite] = useState("sc-domain:holidaysmart.io");
	const [pageUrl, setPageUrl] = useState("");
	const [startDate, setStartDate] = useState<string>(() => {
		const end = new Date();
		const start = new Date(end);
		start.setDate(end.getDate() - 14);
		return start.toISOString().split("T")[0]!;
	});
	const [periodDays, setPeriodDays] = useState<number>(14);
	const [sites, setSites] = useState<string[]>([]);
	const [sitesLoading, setSitesLoading] = useState(false);
	const [sitesError, setSitesError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setSitesLoading(true);
			setSitesError(null);
			try {
				const res = await fetch("/api/sites", { cache: "no-store" });
				if (!res.ok) throw new Error(`Sites fetch failed: ${res.status}`);
				const json = await res.json();
				let list: string[] = [];
				if (Array.isArray(json)) {
					list = json
						.map((x) => (typeof x === "string" ? x : (x?.site || x?.id || x?.name)))
						.filter((v: any): v is string => typeof v === "string");
				}
				if (!cancelled) setSites(list);
			} catch (e: any) {
				if (!cancelled) setSitesError(e?.message || String(e));
			} finally {
				if (!cancelled) setSitesLoading(false);
			}
		};
		load();
		return () => { cancelled = true; };
	}, []);
	const [expandedRow, setExpandedRow] = useState<number | null>(null);
	const [isMounted, setIsMounted] = useState(false);
	const [hasOpenModal, setHasOpenModal] = useState(false);
	const [selectedRegion, setSelectedRegion] = useState<string>("all");
	const scrollIndicatorRef = useRef<HTMLDivElement>(null);
	const [data, setData] = useState<any[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const refetch = useCallback(async () => {
		// Guard: require either a domain or a page URL
		if (!pageUrl.trim() && !site.trim()) {
			setError(new Error("Please enter a domain or a page URL."));
			setData([]);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			// If pageUrl is provided, query the by-url endpoint for that specific page
			const endpoint = pageUrl.trim() ? "/api/search/by-url" : "/api/search/list";
			const payload = pageUrl.trim()
				? { site, page: pageUrl.trim(), startDate, periodDays }
				: { site };
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error(`Search failed: ${res.status}`);
			const json = await res.json();
			setData(Array.isArray(json) ? json : []);
		} catch (e: any) {
			setError(e instanceof Error ? e : new Error(String(e)));
			setData([]);
		} finally {
			setIsLoading(false);
		}
	}, [site, pageUrl, startDate, periodDays]);

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
					{!pageUrl.trim() && (
						<div className="flex-1">
							{sitesLoading ? (
								<div className="text-[var(--gray-5)] text-[var(--text-sm)]">Loading sites...</div>
							) : sites && sites.length > 0 ? (
								<select
									value={site}
									onChange={(e) => setSite(e.target.value)}
									className="w-full border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-lg)] py-[var(--space-md)] font-bold text-[var(--ink)] text-[var(--text-xl)] focus:border-[var(--accent-primary)] focus:outline-none"
								>
									{sites.map((s, i) => (
										<option key={i} value={s} className="text-[var(--ink)]">
											{s}
										</option>
									))}
								</select>
							) : (
								<input
									type="text"
									value={site}
									onChange={(e) => setSite(e.target.value)}
									onKeyPress={handleKeyPress}
									className="w-full border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-lg)] py-[var(--space-md)] font-bold text-[var(--ink)] text-[var(--text-xl)] placeholder:text-[var(--gray-5)] focus:border-[var(--accent-primary)] focus:outline-none"
									placeholder="Domain (e.g., sc-domain:example.com)"
								/>
							)}
							{sitesError && (
								<div className="mt-[var(--space-xs)] text-[var(--text-xs)] text-red-500">{sitesError}</div>
							)}
						</div>
					)}
								<input
									type="text"
									value={pageUrl}
									onChange={(e) => setPageUrl(e.target.value)}
									onKeyPress={handleKeyPress}
									className="flex-1 border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-lg)] py-[var(--space-md)] font-bold text-[var(--ink)] text-[var(--text-xl)] transition-all duration-[var(--duration-normal)] placeholder:text-[var(--gray-5)] focus:border-[var(--accent-primary)] focus:outline-none"
									placeholder="Exact page URL (optional)"
								/>
								{pageUrl.trim() && (
									<div className="flex flex-col gap-[var(--space-md)] sm:flex-row sm:items-end">
										<div className="flex items-center gap-[var(--space-sm)]">
											<label className="text-[var(--gray-5)] text-[var(--text-xs)]">Start Date</label>
											<input
												type="date"
												value={startDate}
												onChange={(e) => setStartDate(e.target.value)}
												className="border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-sm)] py-[var(--space-xs)] font-bold text-[var(--ink)] text-[var(--text-sm)] focus:border-[var(--accent-primary)] focus:outline-none"
											/>
										</div>
										<div className="flex items-center gap-[var(--space-sm)]">
											<label className="text-[var(--gray-5)] text-[var(--text-xs)]">Days</label>
											<select
												value={periodDays}
												onChange={(e) => setPeriodDays(Number(e.target.value))}
												className="border-[var(--gray-6)] border-b-3 bg-transparent px-[var(--space-sm)] py-[var(--space-xs)] font-bold text-[var(--ink)] text-[var(--text-sm)] focus:border-[var(--accent-primary)] focus:outline-none"
											>
												<option value={7}>7</option>
												<option value={14}>14</option>
												<option value={28}>28</option>
											</select>
										</div>
									</div>
								)}
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
							{pageUrl.trim()
								? `${filteredData.length} result for specific page`
								: `${filteredData.length} of ${data.length} pages with hijacking potential`}
						</p>
						</div>

						{/* Region Filter - hide when querying exact page */}
						{!pageUrl.trim() && (
							<RegionFilter 
								data={data}
								selectedRegion={selectedRegion}
								onRegionChange={setSelectedRegion}
							/>
						)}

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

// DataCard is now imported from '~/components/DataCard'
