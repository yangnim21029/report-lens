"use client";

import { useEffect, useState } from "react";
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

export function OptimizationPanel({
	rowData,
	isExpanded,
	onToggle,
}: OptimizationPanelProps) {
	const [activeTab, setActiveTab] = useState<
		"quick" | "paragraph" | "structure"
	>("quick");

	const {
		mutate: analyzeContent,
		data,
		isPending: isLoading,
		error,
	} = api.optimize.analyzeContent.useMutation();

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
					<div className="h-8 w-8 animate-spin rounded-full border-white border-b-2"></div>
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
					return data.sections.quickWins || "無語意分析結果";
				case "paragraph":
					return data.sections.paragraphAdditions || "無劫持策略";
				case "structure":
					return data.sections.structuralChanges || "無實施建議";
			}
		};

		return (
			<div className="space-y-4">
				{/* Tab Navigation */}
				<div className="flex gap-2 border-white/20 border-b">
					<button
						onClick={() => setActiveTab("quick")}
						className={`px-4 py-2 font-medium transition-colors ${
							activeTab === "quick"
								? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
								: "text-white/60 hover:text-white"
						}`}
					>
						🎯 語意分析
					</button>
					<button
						onClick={() => setActiveTab("paragraph")}
						className={`px-4 py-2 font-medium transition-colors ${
							activeTab === "paragraph"
								? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
								: "text-white/60 hover:text-white"
						}`}
					>
						📝 劫持策略
					</button>
					<button
						onClick={() => setActiveTab("structure")}
						className={`px-4 py-2 font-medium transition-colors ${
							activeTab === "structure"
								? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
								: "text-white/60 hover:text-white"
						}`}
					>
						🔄 實施建議
					</button>
				</div>

				{/* Tab Content */}
				<div className="rounded-lg bg-white/5 p-6">
					<div className="prose prose-invert max-w-none">
						<pre className="whitespace-pre-wrap font-sans text-sm text-white/90">
							{getTabContent()}
						</pre>
					</div>
				</div>

				{/* Keywords Analyzed Badge */}
				{data.keywordsAnalyzed > 0 && (
					<div className="flex justify-end">
						<span className="rounded-full bg-white/10 px-3 py-1 text-white/60 text-xs">
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
				className="rounded-md bg-[hsl(280,100%,70%)]/20 px-3 py-1 font-medium text-[hsl(280,100%,70%)] text-sm transition hover:bg-[hsl(280,100%,70%)]/30 disabled:opacity-50"
			>
				{isExpanded ? "收起" : "優化建議"}
			</button>

			{/* Panel Content - Rendered conditionally in parent */}
			{isExpanded && <div className="mt-4">{renderContent()}</div>}
		</>
	);
}
