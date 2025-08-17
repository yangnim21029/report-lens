interface ExtractedAnalysis {
	page: string;
	bestQuery: string;
	strategy: "REPOST" | "NEW POST";
	priority: {
		shortTerm: string[];
		semanticHijack: string[];
	};
	executionList: string[]; // 執行清單
	titleSuggestion?: string; // 標題建議
	newPostTopic?: string; // NEW POST 的主題方向
	bestOpportunity?: string; // 最佳劫持機會
}

interface EmailFields {
	subject: string;
	keyOpportunity: string;
	topActions: string[];
	strategyInsight: string;
	immediateWin?: string;
}

export function extractAnalysisData(
	analysisText: string,
	pageData: {
		page: string;
		best_query: string;
	},
): ExtractedAnalysis {
	const strategy = determineStrategy(analysisText);

	// 提取實施優先級
	const priority = {
		shortTerm: [] as string[],
		semanticHijack: [] as string[],
	};

	// 新的 API 格式提取 - Implementation Priority section
	const prioritySection =
		extractSection(
			analysisText,
			"## Implementation Priority",
			null, // v5 doesn't have Required Execution Items section
		) || extractSection(analysisText, "實施優先級", "必備執行項目");

	if (prioritySection) {
		// 新 API 格式：Immediate Actions (可能包含說明文字)
		const immediateMatch =
			prioritySection.match(
				/### Immediate Actions[\s\S]*?(?=### Optional Enhancements|確認與備註|$)/s,
			) ||
			prioritySection.match(
				/立即執行[（(]必備改動[）)][\s\S]*?(?=可選優化|$)/s,
			);
		if (immediateMatch) {
			// 提取 colon 後的內容
			const content = immediateMatch[0]
				.replace(/### Immediate Actions[^:]*:/, "")
				.trim();
			priority.shortTerm =
				extractListItems(content) || extractParagraphItems(content);
		}

		// 新 API 格式：Optional Enhancements
		const optionalMatch =
			prioritySection.match(
				/### Optional Enhancements[\s\S]*?(?=##|確認與備註|$)/s,
			) || prioritySection.match(/可選優化[（(][^）)]*[）)][\s\S]*?(?=##|$)/s);
		if (optionalMatch) {
			const content = optionalMatch[0]
				.replace(/### Optional Enhancements/, "")
				.trim();
			priority.semanticHijack =
				extractListItems(content) || extractParagraphItems(content);
		}

		// 舊格式相容：短期優化
		if (priority.shortTerm.length === 0) {
			const shortTermMatch =
				prioritySection.match(
					/短期優化[（(][^）)]+[）)][\s\S]*?(?=語義劫持布局|$)/s,
				) || prioritySection.match(/### 📈 短期優化[^#]*?(?=###|$)/s);
			if (shortTermMatch) {
				priority.shortTerm = extractListItems(shortTermMatch[0]);
			}
		}

		// 舊格式相容：語義劫持布局
		if (priority.semanticHijack.length === 0) {
			const semanticMatch =
				prioritySection.match(
					/語義劫持布局[（(][^）)]+[）)][\s\S]*?(?=必備執行項目|$)/s,
				) || prioritySection.match(/### 🎯 語義劫持布局[^#]*?(?=###|$)/s);
			if (semanticMatch) {
				priority.semanticHijack = extractListItems(semanticMatch[0]);
			}
		}
	}

	// 提取必備執行項目
	let executionList: string[] = [];

	// 新 API 格式：從 Immediate Actions 中提取執行項目 (v5 format)
	// v5 format uses Immediate Actions section instead of separate Required Execution Items
	const executionSection = prioritySection
		? extractSection(
				prioritySection,
				"### Immediate Actions",
				"### Optional Enhancements",
			)
		: null ||
			extractSection(analysisText, "## 📝 Required Execution Items", null) ||
			extractSection(analysisText, "## Required Execution Checklist", null) ||
			extractSection(analysisText, "必備執行項目", "實施方式") ||
			extractSection(analysisText, "## 📝 必備執行項目", null);

	if (executionSection) {
		// 優先使用 extractListItems，如果沒有結果則使用 extractParagraphItems
		executionList = extractListItems(executionSection);
		if (executionList.length === 0) {
			executionList = extractParagraphItems(executionSection);
		}

		// 如果還是沒有，嘗試舊格式
		if (executionList.length === 0) {
			const lines = executionSection.split("\n");
			for (const line of lines) {
				// 舊格式相容: "最關鍵改動：xxx"
				const keyMatch = line.match(
					/^(最關鍵改動|次關鍵改動|第三項)[：:]\s*(.+)$/,
				);
				if (keyMatch && keyMatch[2]) {
					const content = keyMatch[2].split("。理由：")[0].trim();
					if (content) {
						executionList.push(content);
					}
				}
			}
		}
	}

	// 提取標題建議 - 從 Core Hijacking Strategy 部分
	let titleSuggestion = "";
	let bestOpportunity = "";

	const strategySection =
		extractSection(
			analysisText,
			"## Core Hijacking Strategy",
			"## Implementation Priority",
		) ||
		extractSection(
			analysisText,
			"### Essential Element",
			"## Implementation Priority",
		);

	if (strategySection) {
		// 提取 Essential Element
		const essentialMatch = strategySection.match(
			/### Essential Element:\s*([^\n]+)/,
		);
		if (essentialMatch && essentialMatch[1] && essentialMatch[1] !== "N/A") {
			bestOpportunity = essentialMatch[1].trim();
		}

		// 提取 Hijacking Statement
		const hijackMatch = strategySection.match(
			/\*\*Hijacking Statement\*\*:\s*([^\n]+)/,
		);
		if (hijackMatch && hijackMatch[1] && hijackMatch[1] !== "N/A") {
			titleSuggestion = hijackMatch[1].trim();
		}
	}

	// 如果沒有找到，嘗試舊格式
	if (!titleSuggestion) {
		if (strategy === "REPOST") {
			const titleMatch = analysisText.match(/標題調整為「([^」]+)」/);
			if (titleMatch && titleMatch[1]) {
				titleSuggestion = titleMatch[1];
			}
		} else if (strategy === "NEW POST") {
			const titleMatch = analysisText.match(/新文章主題「([^」]+)」/);
			if (titleMatch && titleMatch[1]) {
				titleSuggestion = titleMatch[1];
			}
		}
	}

	// 提取 NEW POST 切角
	let newPostTopic = "";
	if (strategy === "NEW POST") {
		// 從 Target Type 提取
		const targetMatch = analysisText.match(/\*\*Target Type\*\*:\s*([^\n]+)/);
		if (targetMatch && targetMatch[1] && targetMatch[1] !== "N/A") {
			newPostTopic = targetMatch[1].trim();
		}

		// 舊格式相容
		if (!newPostTopic) {
			const topicMatch = analysisText.match(/處理\s+\[([^\]]+)\]/);
			if (topicMatch && topicMatch[1]) {
				newPostTopic = topicMatch[1].trim();
			}
		}
	}

	return {
		page: pageData.page,
		bestQuery: pageData.best_query || "Unknown Query",
		strategy,
		priority,
		executionList,
		...(titleSuggestion && { titleSuggestion }),
		...(newPostTopic && { newPostTopic }),
		...(bestOpportunity && { bestOpportunity }),
	};
}

function determineStrategy(text: string): "REPOST" | "NEW POST" {
	// 多種格式匹配
	const patterns = [
		// 新 API 格式：Strategy Decision 或從 Core Hijacking Strategy 中推斷
		/### Strategy Decision[\s\S]*?Recommendation:\s*(REPOST|NEW POST)/i,
		/Recommendation:\s*(REPOST|NEW POST)/i,
		/Strategy:\s*(REPOST|NEW POST)/i,
		/Approach:\s*(REPOST|NEW POST)/i,
		// 舊格式相容
		/建議[（(](REPOST|NEW POST)[／/]?\s*(?:NEW POST|REPOST)?[）)]/i,
		/### 策略判斷[\s\S]*?建議[（(](REPOST|NEW POST)/i,
		/### 實施方式[：:]\s*\[?(REPOST|NEW POST)\]?/i,
		/實施方式[：:]\s*\[?(REPOST|NEW POST)\]?/i,
		/\*\*建議\*?\*?[：:]\s*\[?(REPOST|NEW POST)\]?/i,
		/建議[：:]\s*\[?(REPOST|NEW POST)\]?/i,
		/策略判斷[\s\S]*?建議[：:]\s*\[?(REPOST|NEW POST)\]?/i,
	];

	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].toUpperCase().trim() as "REPOST" | "NEW POST";
		}
	}

	// 默認為 REPOST（較保守的策略）
	return "REPOST";
}

function extractSection(
	text: string,
	startMarker: string,
	endMarker: string | null,
): string {
	const startIndex = text.indexOf(startMarker);
	if (startIndex === -1) return "";

	const endIndex = endMarker
		? text.indexOf(endMarker, startIndex)
		: text.length;
	return text.substring(startIndex, endIndex !== -1 ? endIndex : text.length);
}

function extractListItems(text: string): string[] {
	const items: string[] = [];

	// Match both - and numbered list items
	const lines = text.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines and headers
		if (!trimmed || trimmed.startsWith("#")) continue;

		// Match - list items
		if (trimmed.startsWith("- ")) {
			items.push(trimmed.substring(2).trim());
		}
		// Match numbered list items
		else if (/^\d+\.\s/.test(trimmed)) {
			items.push(trimmed.replace(/^\d+\.\s*/, "").trim());
		}
		// Match Chinese numbered items (e.g., 一、二、)
		else if (/^[一二三四五六七八九十]+[、.]/.test(trimmed)) {
			items.push(
				trimmed.replace(/^[一二三四五六七八九十]+[、.]\s*/, "").trim(),
			);
		}
	}

	return items.filter((item) => item.length > 0 && !item.includes("N/A"));
}

// Helper function to extract paragraph-style items (for v5 format)
function extractParagraphItems(text: string): string[] {
	const items: string[] = [];

	// Split by sentences ending with Chinese period
	const sentences = text.split(/。(?!」)/g);

	for (const sentence of sentences) {
		const trimmed = sentence.trim();
		if (trimmed && trimmed.length > 10 && !trimmed.includes("N/A")) {
			// Add back the period if it was removed
			items.push(trimmed + (trimmed.endsWith("。") ? "" : "。"));
		}
	}

	// If no sentences found, try to split by line breaks for longer items
	if (items.length === 0) {
		const lines = text.split("\n").filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				trimmed.length > 10 &&
				!trimmed.startsWith("#") &&
				!trimmed.includes("N/A")
			);
		});
		items.push(...lines.map((l) => l.trim()));
	}

	return items;
}

// 移除舊的提取函數，已整合到主函數中

export function formatAsMarkdown(extracted: ExtractedAnalysis): string {
	const lines: string[] = [];

	// Header
	lines.push(`📊 *SEO 分析報告*`);
	lines.push(`📍 頁面: ${extracted.page}`);
	lines.push(`🎯 Best Query: *${extracted.bestQuery}*`);
	lines.push(`📝 策略: *${extracted.strategy}*`);
	lines.push("");

	// Priority Section
	if (extracted.priority.shortTerm.length > 0) {
		lines.push("*📈 立即執行項目:*");
		extracted.priority.shortTerm.forEach((item) => {
			lines.push(`• ${item}`);
		});
		lines.push("");
	}

	if (extracted.priority.semanticHijack.length > 0) {
		lines.push("*🎯 可選優化項目:*");
		extracted.priority.semanticHijack.forEach((item) => {
			lines.push(`• ${item}`);
		});
		lines.push("");
	}

	// Execution List
	if (extracted.executionList.length > 0) {
		lines.push(`*📝 ${extracted.strategy} 執行清單:*`);
		extracted.executionList.forEach((item, idx) => {
			lines.push(`${idx + 1}. ${item}`);
		});
		lines.push("");
	}

	// Optional: Best Opportunity
	if (extracted.bestOpportunity) {
		lines.push(`*🔑 最佳機會:* ${extracted.bestOpportunity}`);
		lines.push("");
	}

	// Optional: Title Suggestion
	if (extracted.titleSuggestion) {
		lines.push(`*📰 標題建議:* "${extracted.titleSuggestion}"`);
		lines.push("");
	}

	lines.push(
		`⏰ ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
	);

	return lines.join("\n");
}

export function formatAsCSV(extracted: ExtractedAnalysis): string {
	const rows: string[][] = [];

	// 精簡的 CSV - 只保留可分析的核心數據
	rows.push([
		"URL",
		"Best Query",
		"Strategy",
		"Core Action",
		"Opportunity",
		"Title Suggestion",
	]);

	rows.push([
		extracted.page,
		extracted.bestQuery,
		extracted.strategy,
		extracted.executionList[0] || "",
		extracted.bestOpportunity || "",
		extracted.titleSuggestion || "",
	]);

	// Convert to CSV format
	return rows
		.map((row) =>
			row
				.map((cell) => {
					// Escape quotes and wrap in quotes if contains comma or quotes
					const escaped = cell.replace(/"/g, '""');
					return /[,"\n]/.test(cell) ? `"${escaped}"` : escaped;
				})
				.join(","),
		)
		.join("\n");
}

export async function extractEmailFieldsWithAI(
	extracted: ExtractedAnalysis,
	analysisText: string,
	openaiClient?: any,
): Promise<EmailFields | null> {
	try {
		// 如果沒有提供 OpenAI client，返回 null
		if (!openaiClient) {
			console.log("No OpenAI client provided, skipping AI extraction");
			return null;
		}

		const prompt = `
    Based on the following SEO analysis, extract the most critical 20% of information for an email summary.
    Focus on actionable insights that drive immediate value.
    
    Current Analysis:
    - Page: ${extracted.page}
    - Target Query: ${extracted.bestQuery}
    - Strategy: ${extracted.strategy}
    - Key Opportunity: ${extracted.bestOpportunity || "Not specified"}
    - Title Suggestion: ${extracted.titleSuggestion || "Not specified"}
    
    Immediate Actions (Top Priority):
    ${extracted.priority.shortTerm
			.slice(0, 3)
			.map((item, i) => `${i + 1}. ${item}`)
			.join("\n")}
    
    Optional Enhancements:
    ${extracted.priority.semanticHijack
			.slice(0, 2)
			.map((item, i) => `${i + 1}. ${item}`)
			.join("\n")}
    
    Full Analysis Context:
    ${analysisText.substring(0, 2000)} // Limit context to avoid token overflow
    
    Return ONLY an XML structure with these fields:
    <email_fields>
      <subject>One compelling subject line that captures the core value (max 60 chars)</subject>
      <key_opportunity>The single most important opportunity in 1-2 sentences</key_opportunity>
      <top_actions>The 1-3 most critical actions, separated by |</top_actions>
      <strategy_insight>One sentence explaining why this strategy will work</strategy_insight>
      <immediate_win>Optional: One quick win that can be implemented today</immediate_win>
    </email_fields>
    
    Requirements:
    - Be extremely concise and action-oriented
    - Focus ONLY on the highest-impact 20% of elements
    - Use clear, non-technical language
    - Subject line should be compelling and specific
    - Do NOT include any text outside the XML tags
    `;

		// 調用 OpenAI API
		const completion = await openaiClient.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are an expert at extracting key insights from SEO analysis reports. Focus on the most actionable and high-impact information only.",
				},
				{
					role: "user",
					content: prompt,
				},
			],
			temperature: 0.3, // 低溫度以獲得更一致的結構化輸出
			max_tokens: 500,
		});

		const aiResponse = completion.choices[0]?.message?.content || "";

		// 解析 XML 響應
		const parsed = parseEmailXML(aiResponse);

		if (!parsed) {
			console.warn(
				"Failed to parse AI response as XML, falling back to default",
			);
			return null;
		}

		return parsed;
	} catch (error) {
		console.error("AI email extraction failed:", error);
		return null;
	}
}

function parseEmailXML(xmlString: string): EmailFields | null {
	try {
		// 簡單的 XML 解析（不依賴外部庫）
		const getXMLValue = (xml: string, tag: string): string => {
			const regex = new RegExp(`<${tag}>([\s\S]*?)</${tag}>`, "i");
			const match = xml.match(regex);
			return match ? match[1].trim() : "";
		};

		const subject = getXMLValue(xmlString, "subject");
		const keyOpportunity = getXMLValue(xmlString, "key_opportunity");
		const topActionsStr = getXMLValue(xmlString, "top_actions");
		const strategyInsight = getXMLValue(xmlString, "strategy_insight");
		const immediateWin = getXMLValue(xmlString, "immediate_win");

		if (!subject || !keyOpportunity || !topActionsStr || !strategyInsight) {
			return null;
		}

		return {
			subject,
			keyOpportunity,
			topActions: topActionsStr
				.split("|")
				.map((s) => s.trim())
				.filter((s) => s),
			strategyInsight,
			immediateWin: immediateWin || undefined,
		};
	} catch (error) {
		console.error("XML parsing failed:", error);
		return null;
	}
}

export async function formatAsEmailWithAI(
	extracted: ExtractedAnalysis,
	analysisText?: string,
	openaiClient?: any,
): Promise<string> {
	// 如果有 OpenAI client 和分析文本，嘗試 AI 提取
	let aiFields: EmailFields | null = null;
	if (openaiClient && analysisText) {
		console.log("Attempting AI-powered email field extraction...");
		aiFields = await extractEmailFieldsWithAI(
			extracted,
			analysisText,
			openaiClient,
		);

		if (aiFields) {
			console.log("Successfully extracted email fields with AI");
		} else {
			console.log("AI extraction failed, using default format");
		}
	}

	// 使用 AI 提取的內容或降級到原始邏輯
	return formatAsEmailInternal(extracted, aiFields);
}

export function formatAsEmail(extracted: ExtractedAnalysis): string {
	// 保持向後兼容的同步版本
	return formatAsEmailInternal(extracted, null);
}

function formatAsEmailInternal(
	extracted: ExtractedAnalysis,
	aiFields: EmailFields | null,
): string {
	const lines: string[] = [];

	// Subject line - 使用 AI 優化的主題或原始格式
	if (aiFields?.subject) {
		lines.push(`Subject: ${aiFields.subject}`);
	} else {
		lines.push(
			`Subject: SEO Analysis - ${extracted.bestQuery} [${extracted.strategy}]`,
		);
	}
	lines.push("---");
	lines.push("");

	// Greeting
	lines.push("Hi Team,");
	lines.push("");
	lines.push(`Here's the SEO optimization analysis for the following page:`);
	lines.push(`URL: ${extracted.page}`);
	lines.push("");

	// Executive Summary - 使用 AI 優化的內容或原始格式
	lines.push("## Executive Summary");
	lines.push(`Target Keyword: ${extracted.bestQuery}`);
	lines.push(`Recommended Strategy: ${extracted.strategy}`);

	// 使用 AI 的關鍵機會或原始內容
	if (aiFields?.keyOpportunity) {
		lines.push(`Key Opportunity: ${aiFields.keyOpportunity}`);
	} else if (extracted.bestOpportunity) {
		lines.push(`Key Opportunity: ${extracted.bestOpportunity}`);
	}

	// 添加策略洞察（如果 AI 提供）
	if (aiFields?.strategyInsight) {
		lines.push(`Why This Works: ${aiFields.strategyInsight}`);
	}
	lines.push("");

	// Priority Actions - 使用 AI 精選的行動或原始列表
	const actionsToShow = aiFields?.topActions || extracted.priority.shortTerm;

	if (actionsToShow.length > 0) {
		lines.push("## Immediate Actions");

		// 如果有 AI 的立即勝利，突出顯示
		if (aiFields?.immediateWin) {
			lines.push(`🎯 **Quick Win**: ${aiFields.immediateWin}`);
			lines.push("");
		}

		lines.push(
			"These changes must be implemented for successful optimization:",
		);
		actionsToShow.forEach((item, idx) => {
			lines.push(`${idx + 1}. ${item}`);
		});
		lines.push("");
	}

	// Optional Enhancements
	if (extracted.priority.semanticHijack.length > 0) {
		lines.push("## Optional Enhancements");
		lines.push("Additional optimizations if resources permit:");
		extracted.priority.semanticHijack.forEach((item, idx) => {
			lines.push(`${idx + 1}. ${item}`);
		});
		lines.push("");
	}

	// Execution Items (if separate from Immediate Actions)
	if (
		extracted.executionList.length > 0 &&
		extracted.executionList.length !== extracted.priority.shortTerm.length
	) {
		lines.push("## 📝 Execution Items");
		lines.push("Step-by-step implementation guide:");
		lines.push("");
		extracted.executionList.forEach((item, idx) => {
			lines.push(`${idx + 1}. ${item}`);
		});
		lines.push("");
	}

	// Strategy Details
	lines.push("## Strategy Details");
	lines.push(`**Approach: ${extracted.strategy}**`);

	// Hijacking Statement / Title Suggestion
	if (extracted.titleSuggestion) {
		lines.push("");
		if (extracted.strategy === "REPOST") {
			lines.push(`Hijacking Statement: "${extracted.titleSuggestion}"`);
		} else {
			lines.push(`New Article Focus: "${extracted.titleSuggestion}"`);
		}
	}

	// Target Type / Focus Area for NEW POST
	if (extracted.newPostTopic) {
		lines.push(`Target Type: ${extracted.newPostTopic}`);
	}

	// Closing
	lines.push("");
	lines.push("---");
	lines.push("");
	lines.push("Best regards,");
	lines.push("RepostLens SEO Analysis Tool");
	lines.push("");
	lines.push(
		`Generated: ${new Date().toLocaleString("zh-TW", {
			timeZone: "Asia/Taipei",
		})}`,
	);

	return lines.join("\n");
}

// Keep the old function name for backward compatibility
export const formatForGoogleChat = formatAsMarkdown;
