"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

interface OptimizationRowProps {
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
	index: number;
}

export function OptimizationRow({ rowData, index }: OptimizationRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState<
		"semantic" | "structure" | "implementation"
	>("semantic");

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

	const getTabContent = () => {
		if (!data) return "";
		switch (activeTab) {
			case "semantic":
				return data.sections.quickWins || "沒有語意分析";
			case "structure":
				return data.sections.paragraphAdditions || "沒有架構建議";
			case "implementation":
				return data.sections.structuralChanges || "沒有實施建議";
		}
	};

	return (
		<>
			<tr key={index} className="hover:bg-white/5">
				<td className="px-4 py-3">
					<a
						href={rowData.page}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[hsl(280,100%,70%)] hover:underline"
					>
						{rowData.page.length > 50
							? `${rowData.page.substring(0, 50)}...`
							: rowData.page}
					</a>
				</td>
				<td className="px-4 py-3">{rowData.best_query || "-"}</td>
				<td className="px-4 py-3">{rowData.best_query_clicks || 0}</td>
				<td className="px-4 py-3">
					<div className="max-w-xs truncate">
						{[rowData.rank_4, rowData.rank_5].filter(Boolean).join(", ") || "-"}
					</div>
				</td>
				<td className="px-4 py-3">
					<div className="max-w-xs truncate">
						{[rowData.rank_6, rowData.rank_7].filter(Boolean).join(", ") || "-"}
					</div>
				</td>
				<td className="px-4 py-3">
					<div className="max-w-xs truncate">
						{[rowData.rank_8, rowData.rank_9, rowData.rank_10]
							.filter(Boolean)
							.join(", ") || "-"}
					</div>
				</td>
				<td className="px-4 py-3">
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						disabled={isLoading}
						className="rounded-md bg-[hsl(280,100%,70%)]/20 px-3 py-1 font-medium text-[hsl(280,100%,70%)] text-sm transition hover:bg-[hsl(280,100%,70%)]/30 disabled:opacity-50"
					>
						{isExpanded ? "收起" : "優化建議"}
					</button>
				</td>
			</tr>

			{isExpanded && (
				<tr>
					<td colSpan={7} className="p-0">
						<div className="border-white/10 border-t bg-white/5 p-6">
							{isLoading ? (
								<div className="flex items-center justify-center py-8">
									<div className="h-8 w-8 animate-spin rounded-full border-white border-b-2"></div>
									<span className="ml-3 text-white">分析中...</span>
								</div>
							) : error ? (
								<div className="rounded-md bg-red-500/20 p-4 text-red-200">
									錯誤: {error.message}
								</div>
							) : data ? (
								<div className="space-y-4">
									{/* Tab Navigation */}
									<div className="flex gap-2 border-white/20 border-b">
										<button
											onClick={() => setActiveTab("semantic")}
											className={`px-4 py-2 font-medium transition-colors ${
												activeTab === "semantic"
													? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
													: "text-white/60 hover:text-white"
											}`}
										>
											🎯 語義劫持
										</button>
										<button
											onClick={() => setActiveTab("structure")}
											className={`px-4 py-2 font-medium transition-colors ${
												activeTab === "structure"
													? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
													: "text-white/60 hover:text-white"
											}`}
										>
											⚡ 決策路徑
										</button>
										<button
											onClick={() => setActiveTab("implementation")}
											className={`px-4 py-2 font-medium transition-colors ${
												activeTab === "implementation"
													? "border-[hsl(280,100%,70%)] border-b-2 text-[hsl(280,100%,70%)]"
													: "text-white/60 hover:text-white"
											}`}
										>
											🚀 實施計畫
										</button>
									</div>

									{/* Tab Content */}
									<div className="max-h-[600px] overflow-y-auto rounded-lg bg-white/5 p-6">
										<div className="prose prose-invert max-w-none">
											<div className="whitespace-pre-wrap font-sans text-sm text-white/90 leading-relaxed">
												{getTabContent()
													.split("\n")
													.map((line, i) => {
														// Format headers
														if (line.startsWith("###")) {
															return (
																<h4
																	key={i}
																	className="mt-4 mb-2 font-semibold text-base text-white"
																>
																	{line.replace(/^###\s*/, "")}
																</h4>
															);
														}
														if (line.startsWith("##")) {
															return (
																<h3
																	key={i}
																	className="mt-6 mb-3 font-bold text-[hsl(280,100%,70%)] text-lg"
																>
																	{line.replace(/^##\s*/, "")}
																</h3>
															);
														}
														// Format list items
														if (line.startsWith("- ")) {
															return (
																<li key={i} className="mb-1 ml-4 list-disc">
																	{line.replace(/^-\s*/, "")}
																</li>
															);
														}
														// Format numbered items
														if (line.match(/^\d+\.\s/)) {
															return (
																<li key={i} className="mb-1 ml-4 list-decimal">
																	{line.replace(/^\d+\.\s*/, "")}
																</li>
															);
														}
														// Regular text
														return line.trim() ? (
															<p key={i} className="mb-2">
																{line}
															</p>
														) : (
															<br key={i} />
														);
													})}
											</div>
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
							) : null}
						</div>
					</td>
				</tr>
			)}
		</>
	);
}
