import { convert } from "html-to-text";
import { OpenAI } from "openai";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const optimizeRouter = createTRPCRouter({
	analyzeContent: publicProcedure
		.input(
			z.object({
				page: z.string(),
				bestQuery: z.string().nullable(),
				bestQueryClicks: z.number().nullable(),
				bestQueryPosition: z.number().nullable(),
				// 前期數據
				prevBestQuery: z.string().nullable(),
				prevBestPosition: z.number().nullable(),
				prevBestClicks: z.number().nullable(),
				// 排名關鍵詞
				rank4: z.string().nullable(),
				rank5: z.string().nullable(),
				rank6: z.string().nullable(),
				rank7: z.string().nullable(),
				rank8: z.string().nullable(),
				rank9: z.string().nullable(),
				rank10: z.string().nullable(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				// Step 1: Fetch article content
				const contentResponse = await fetch(input.page, {
					headers: {
						"User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)",
					},
				});

				if (!contentResponse.ok) {
					throw new Error(`Failed to fetch content: ${contentResponse.status}`);
				}

				const html = await contentResponse.text();

				// Extract region from URL for language localization
				const region = input.page.includes("holidaysmart.io")
					? input.page.match(/\/(hk|tw|sg)\//)?.[1] || "hk"
					: "hk";

				// Define language and locale settings
				const localeSettings = {
					hk: {
						language: "繁體中文（香港）",
						style: "港式用詞",
						examples: "係、嚟、唔、咁、啱、舖頭",
						tone: "親切、地道、生活化",
					},
					tw: {
						language: "繁體中文（台灣）",
						style: "台式用詞",
						examples: "的、來、不、這樣、對、店家",
						tone: "溫馨、在地、貼心",
					},
					cn: {
						language: "簡體中文（中國大陸）",
						style: "大陸用詞",
						examples: "的、来、不、这样、对、商家",
						tone: "專業、直接、實用",
					},
					sg: {
						language: "繁體中文（新加坡）",
						style: "星式用詞",
						examples: "的、來、不、這樣、對、店舖",
						tone: "多元、現代、簡潔",
					},
					default: {
						language: "繁體中文",
						style: "標準用詞",
						examples: "的、來、不、這樣、對、店舖",
						tone: "中性、標準、清晰",
					},
				};

				const currentLocale =
					localeSettings[region as keyof typeof localeSettings] ||
					localeSettings.default;

				// Extract meta information
				const titleMatch = html.match(/<title>(.*?)<\/title>/i);
				const metaDescMatch = html.match(
					/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i,
				);
				const ogTitleMatch = html.match(
					/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i,
				);
				const ogDescMatch = html.match(
					/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i,
				);

				const pageTitle = titleMatch ? titleMatch[1] : "";
				const metaDescription = metaDescMatch ? metaDescMatch[1] : "";
				const ogTitle = ogTitleMatch ? ogTitleMatch[1] : "";
				const ogDescription = ogDescMatch ? ogDescMatch[1] : "";

				// Helper function to extract image positions
				const extractImagePositions = (html: string) => {
					const imgRegex = /<img[^>]*>/gi;
					const images = [];
					let match;
					let count = 0;

					// Calculate text position before each image (extract up to 10 images)
					while ((match = imgRegex.exec(html)) && count < 10) {
						// Extract alt text
						const altMatch = match[0].match(/alt=["']([^"']*?)["']/i);
						const altText = altMatch ? altMatch[1] : "";

						// Get text before image to calculate position
						const beforeImg = html
							.substring(0, match.index)
							.replace(/<[^>]*>/g, "");
						const cleanText = beforeImg.replace(/\s+/g, " ").trim();

						// Calculate character position
						const position = cleanText.length;

						images.push(`[圖${count + 1}:"${altText}", 位置:${position}字]`);
						count++;
					}

					return images.length > 0 ? "\n\n圖片資訊：" + images.join(", ") : "";
				};

				// Extract main article content using specific selector
				const articleMatch = html.match(
					/<article[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
				);

				let textContent = "";
				let imageInfo = "";

				if (articleMatch && articleMatch[1]) {
					// Found main article content, extract from it
					textContent = convert(articleMatch[1], {
						wordwrap: false,
						selectors: [
							{ selector: "a", options: { ignoreHref: true } },
							{ selector: "img", format: "skip" },
						],
					});

					// Extract image positions
					imageInfo = extractImagePositions(articleMatch[1]);
				} else {
					// Fallback: try to find content in pl-main-article class
					const mainContentMatch = html.match(
						/<div[^>]*class="[^"]*pl-main-article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
					);
					if (mainContentMatch && mainContentMatch[1]) {
						textContent = convert(mainContentMatch[1], {
							wordwrap: false,
							selectors: [
								{ selector: "a", options: { ignoreHref: true } },
								{ selector: "img", format: "skip" },
							],
						});

						// Extract image positions
						imageInfo = extractImagePositions(mainContentMatch[1]);
					} else {
						// Last resort: extract title and basic content
						const titleMatch = html.match(/<title>(.*?)<\/title>/i);
						const title = titleMatch ? titleMatch[1] : "";
						textContent =
							title +
							" " +
							convert(html, {
								wordwrap: false,
								selectors: [
									{ selector: "a", options: { ignoreHref: true } },
									{ selector: "img", format: "skip" },
								],
							}).substring(0, 4000);

						// Extract image positions from full HTML as last resort
						imageInfo = extractImagePositions(html);
					}
				}

				// Clean up ads, navigation and unwanted content
				textContent = textContent
					.replace(/data-key="[^"]*"/g, "")
					.replace(/ad-id-[a-z0-9]+/g, "")
					.replace(/data-v-[a-f0-9]+/g, "")
					.replace(/loading\.png/g, "")
					.replace(/presslogic-hk-hd\/static\/images/g, "")
					.replace(/\/hk\/category\/[a-zA-Z-]+/g, "")
					.replace(/\/hk\/author\/[a-zA-Z-]+/g, "")
					.replace(/By [A-Za-z\s]+ on \d+ [A-Za-z]+ \d+/g, "")
					.replace(/Digital Editor/g, "")
					.replace(/香港好去處|生活熱話|購物著數|美食推介|旅遊攻略/g, "")
					.replace(/\s+/g, " ")
					.trim()
					.substring(0, 8000); // Limit content length for API

				// Append image info to the content
				textContent += imageInfo;

				// Step 2: Collect and format keywords with rank and click information
				const keywordsList: string[] = [];
				const allKeywords: string[] = [];
				const attributeWords = new Set<string>();
				const seenNormalizedKeywords = new Set<string>();

				// Helper function to remove spaces from string (for duplicate detection)
				const removeSpaces = (str: string) => str.replace(/\s+/g, "");

				// Normalize Best Query for comparison and attribute extraction
				const bestQueryNormalized = removeSpaces(input.bestQuery || "");
				const bestQueryOriginal = input.bestQuery || "";

				// For attribute extraction, normalize the best query first
				const bestQueryForAttributes = bestQueryOriginal.replace(/\s+/g, "");
				const bestQueryChars = bestQueryForAttributes.split("");

				// Process each rank group and format with rank information
				const processRankKeywords = (rankData: string | null, rank: number) => {
					if (!rankData) return;
					const keywords = rankData.split(",").map((k) => k.trim());
					keywords.forEach((keyword) => {
						if (keyword) {
							// Extract keyword and clicks from format: "keyword(clicks)"
							const match = keyword.match(/^(.+?)\((\d+)\)$/);
							let kw = keyword;
							let clicks = "";

							if (match) {
								kw = match[1] ?? "";
								clicks = match[2] ?? "";
							}

							// Check if keyword is duplicate (after removing spaces)
							const kwNormalized = removeSpaces(kw);

							// Skip if duplicate of best query
							if (kwNormalized === bestQueryNormalized) {
								return;
							}

							// Skip if we've already seen this normalized form
							if (seenNormalizedKeywords.has(kwNormalized)) {
								return;
							}
							seenNormalizedKeywords.add(kwNormalized);

							// Extract attribute words (characters not in best query)
							if (input.bestQuery) {
								// Normalize keyword for attribute extraction (remove spaces)
								const kwNormalizedForAttr = kw.replace(/\s+/g, "");
								let remainingChars = kwNormalizedForAttr;

								// Remove each character of best query from the normalized keyword
								bestQueryChars.forEach((char) => {
									remainingChars = remainingChars.replace(char, "");
								});

								// Collect remaining characters as attributes
								if (remainingChars.length > 1) {
									// Keep as one attribute word if meaningful
									attributeWords.add(remainingChars);
								}
							}

							// Add to lists
							if (clicks) {
								keywordsList.push(`- ${kw} (rank: ${rank}, clicks: ${clicks})`);
								allKeywords.push(`${kw}(${clicks})`);
							} else {
								keywordsList.push(`- ${kw} (rank: ${rank})`);
								allKeywords.push(kw);
							}
						}
					});
				};

				processRankKeywords(input.rank4, 4);
				processRankKeywords(input.rank5, 5);
				processRankKeywords(input.rank6, 6);
				processRankKeywords(input.rank7, 7);
				processRankKeywords(input.rank8, 8);
				processRankKeywords(input.rank9, 9);
				processRankKeywords(input.rank10, 10);

				// Create a map to track normalized keywords and their original forms
				const normalizedKeywordMap = new Map<string, string>();
				allKeywords.forEach((kw) => {
					const normalized = kw.replace(/\s+/g, "");
					// Keep the first occurrence of each normalized form
					if (!normalizedKeywordMap.has(normalized)) {
						normalizedKeywordMap.set(normalized, kw);
					}
				});

				// Get unique keywords based on normalized form
				const uniqueKeywords = Array.from(normalizedKeywordMap.values()).filter(
					Boolean,
				);
				const attributesList = Array.from(attributeWords);

				// Step 3: Create structured prompt with proper AI mindset

				const prompt = `
# Role and Objective
Act as an SEO semantic hijacking strategist. Analyze Rank 4–10 keyword data to identify and prioritize low-friction, high-opportunity terms for semantic equivalence with the Best Query, focusing on user satisfaction and intent match.
## Instructions
- Begin with a concise checklist (3–7 bullets) of what you will do; keep items conceptual, not implementation-level.
- Using the input data, determine which keywords present valid semantic hijacking opportunities.
- Compare each candidate with Best Query and previous best, factoring in changes and keyword tail type. Devise targeted semantic equivalence tactics.
- Do not halt or error on missing data; use 'N/A' instead.
- Follow exact output format and Markdown structure (use ##, ### headers) for automated workflows.
- Ground all analysis in data—avoid speculative or baseless recommendations.
- Ensure all language, phrasing, and title suggestions adhere to the specified regional style and tone.
**Essential Element Checklist for Each Recommendation:**
1. Does this keyword represent a "core gap" in the Best Query?
2. Does it measurably reduce user decision friction if added?
3. Would hijacking fail in its absence?
Only recommend items that answer "yes" to all three.
**Semantic Equivalence Validation:**
If a user searching the Best Query receives content for the suggested keyword, would they be satisfied? Only consider "Possibly equivalent" if yes.
## Sub-categories
- For each keyword: record its value, rank, clicks, specificity (broad/specific), and opportunity analysis.
- For each essential equivalence: compare best_query, prev_best_query, changes, and keyword tail type; present precise strategy moving forward.
- Summarize at the end: state hijacking opportunity and top recommendation clearly.

# Context Data
- Article URL: ${input.page}
- Regional language: ${currentLocale.language} - ${currentLocale.style}
- Language characteristics examples: ${currentLocale.examples}
- Tone requirements: ${currentLocale.tone}
- Existing title: ${pageTitle}
- Meta description: ${metaDescription}
- OG title: ${ogTitle}
- Best Query (Rank 1-3): "${input.bestQuery || "N/A"}" - ${
					input.bestQueryClicks || 0
				} clicks - Average rank ${input.bestQueryPosition || "N/A"}
- Previous Best Query: ${
					input.prevBestQuery
						? `"${input.prevBestQuery}" - ${
								input.prevBestClicks || 0
							} clicks - Average rank ${input.prevBestPosition || "N/A"}`
						: "N/A"
				}
- Has changed: ${input.prevBestQuery && input.bestQuery !== input.prevBestQuery}
Keyword list (Rank 4-10):
${keywordsList.join("\n")}
## Data Format Explanation
- Each keyword format: keyword (rank: X, clicks: Y)
- rank: Average Google ranking
- clicks: Total clicks in past 14 days
- Specific: Low-click terms are often specific, user needs but unfamiliar
- Broad: High-click terms are often broad, familiar common terms
- Best Query change indicates attack failure/success; check new keyword scale (short/long tail)
- Article excerpt:
${textContent.substring(0, 4000)}

# Reasoning Steps
- 1: Dissect Best Query for user intent
- 2: Rank 4–10 terms: For each, identify relationship (Equivalent / Subordinate / Related / Unrelated)
- 3: Run scenario test—does content satisfy Best Query user if substituted?
- 4: Identify article gaps and which terms can fill them
- 5: Use only Equivalent or Subordinate terms for recommendations
- 6: Evaluate synergistic value when combining terms
- 7: Decide if REPOST or NEW POST is optimal
- 8: Finalize a compact implementation checklist of only critical changes
# Output Format
- Use the following Markdown sections and tables:
## Search Characteristic Analysis
- Summarize Best Query’s core intent, user friction, key changes (3–5 sentences)
## Semantic Hijacking Opportunities
### Keyword Type Analysis (Rank 4–10)
| Keyword Type | Keywords | Relation to Original | Difficulty | Action |
|--------------|----------|---------------------|------------|--------|
| Vertical | [list] | Direct | Low | REPOST |
| Expandable | [list] | Expansion needed | Med-High | NEW POST |
| Distant | [list] | Parallel | High | NEW POST |
### Semantic Relationship Assessment
| Keyword | Relation to Best Query | Can Hijack | Rationale |
|--------------------|-----------------------|------------|-----------------------------------------------|
| Example: ferry schedule | Equivalent | ✓ | Answers direct user need for ticket search |
| ... | ... | ... | ... |
### Gap Analysis
- Best Query user needs: [describe]
- Article gaps: [list]
- Terms filling gaps: [list or N/A]
## Core Hijacking Strategy (Essential Elements Only)
### Essential Element: [Main keyword]
- **Semantic Relation**: [Equivalent/Subordinate] — [explanation]
- **User Satisfaction**: [Yes/No with brief justification]
- **Why Essential**: [Required for success or hijack fails]
- **Combination**: [Synergistic terms, if applies]
- **Target Type**: [Vertical/Expandable/Distant]
- **Hijacking Statement**: [How it matches Best Query]
- **Change Required**: [Minor/Paragraph/Structural]
- **Expected Effect**: [Anticipated outcome]
### Additional Elements: [Only if meets all tests]
### Strategy Decision
Recommendation: REPOST or NEW POST
Reason: [succinct justification]
## Implementation Priority
### Immediate Actions (Essentials)
- [1–3 mission-critical changes]
### Optional Enhancements
- [Non-essentials]
## 📝 Required Execution Items
1. Most crucial modification
2. Secondary (if needed)
- Specify if REPOST or NEW POST
# Output Requirements
- Be concise: Core insights in 3–5 sentences, actions in lists
- Data-driven: Reference specific keywords/fields
- Explicit: No vague or soft suggestions
# Error Handling
- Replace missing data with 'N/A'
- If no essential hijacking visible: state "No obvious hijacking opportunity"
# Output Format
- Default to plain text. If markdown is required, use ## and ### headers as specified and markdown tables for tabular data.
# Output Structure
Follow the exact section, table, and formatting guidance for consistency with automated workflow consumers. Never reveal chain-of-thought reasoning unless explicitly requested.
`;

				// Step 4: Call OpenAI API with structured system prompt
				const completion = await openai.chat.completions.create({
					model: "gpt-5-mini-2025-08-07", // most advanced model available
					messages: [
						{
							role: "system",
							content: `## 你的角色
你是 SEO 語義劫持專家，專責分析搜尋意圖與規劃詞組等價策略。
分析指定文章的 SEO 語意劫持機會，並基於 Rank 4-10 的關鍵字數據，設計使用 Best Query 進行語意等價策略。
- Analyze the SEO intent capture potential for this article and devise strategies to leverage Rank 4-10 keyword data for semantically equivalent query planning.
`,
						},
						{
							role: "user",
							content: prompt,
						},
					],
				});

				const analysis =
					completion.choices[0]?.message?.content || "無法生成分析結果";

				// Parse sections for display
				const sections = {
					quickWins: "",
					paragraphAdditions: "",
					structuralChanges: "",
				};

				// Extract main sections with new structure
				const searchAnalysisMatch = analysis.match(
					/## Search Characteristic Analysis[\s\S]*?(?=## Semantic Hijacking Opportunities|$)/,
				);
				const hijackMatch = analysis.match(
					/## Semantic Hijacking Opportunities[\s\S]*?(?=## Core Hijacking Strategy|$)/,
				);
				const strategyMatch = analysis.match(
					/## Core Hijacking Strategy[\s\S]*?(?=## Implementation Priority|$)/,
				);
				const priorityMatch = analysis.match(
					/## Implementation Priority[\s\S]*?(?=## 📝 Required Execution Items|$)/,
				);
				const actionPlanMatch = analysis.match(
					/## 📝 Required Execution Items[\s\S]*/,
				);

				// Map to sections for UI display
				// Tab 1: 語意分析
				sections.quickWins =
					(searchAnalysisMatch ? searchAnalysisMatch[0] : "") +
					"\n\n" +
					(hijackMatch ? hijackMatch[0] : "");

				// Tab 2: 策略
				sections.paragraphAdditions = strategyMatch
					? strategyMatch[0]
					: "無劫持策略";

				// Tab 3: 實施建議
				sections.structuralChanges =
					(priorityMatch ? priorityMatch[0] : "無實施建議") +
					"\n\n" +
					(actionPlanMatch ? actionPlanMatch[0] : "");

				return {
					success: true,
					analysis,
					sections,
					keywordsAnalyzed: uniqueKeywords.length,
				};
			} catch (error) {
				console.error("Error in content analysis:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Analysis failed",
					analysis: "",
					sections: {
						quickWins: "",
						paragraphAdditions: "",
						structuralChanges: "",
					},
					keywordsAnalyzed: 0,
				};
			}
		}),
});
