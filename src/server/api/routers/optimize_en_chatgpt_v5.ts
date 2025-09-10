import { convert } from "html-to-text";
import { OpenAI } from "openai";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	extractAnalysisData,
	formatAsEmailWithAI,
} from "~/utils/analysisExtractor";

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
					? input.page.match(/\/(hk|tw|sg|my)\//)?.[1] || "hk"
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
					my: {
						language: "繁體中文（馬來西亞）",
						style: "馬式用詞",
						examples: "的、來、不、這樣、對、店舖",
						tone: "多元、友善、實用",
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
Serve as an SEO semantic hijacking strategist. Identify and prioritize low-friction, high-opportunity keywords ranked 4–10 that semantically align with the provided Best Query. Emphasize **preemptive content coverage** by delivering comprehensive information before users pose specific questions. Restrict all optimization suggestions to those suitable for a content editor, avoiding any technical implementations.

## Additional Context
This task is part of an ongoing SEO content optimization workflow. The output will be used by content editors and strategists seeking to increase organic search visibility and capture additional search demand by preemptively answering user questions. The primary audience for the output is non-technical content editors responsible for updating or creating page content based on organic search opportunity analyses. The task results are intended to directly inform content adjustments and expansion strategies for existing articles or new post ideation.
- **End Goal**: Facilitate increased organic traffic by ensuring the content is optimized for untapped but relevant keywords, thus enhancing the likelihood of appearing in top search results for target queries.
- **Workflow Context**: This task fits into the strategic planning phase of a broader SEO workflow, prior to copywriting and editorial implementation.
- **Success Criteria**: A successful completion is when the output provides actionable, contextually relevant content recommendations covering semantic gaps, helps guide content teams towards increased search capture, and fully adheres to the specified structure and non-technical requirements.

Begin with a concise checklist (3–7 conceptual bullet points) outlining your strategic approach—these should be high-level tasks, not step-by-step instructions.


# Instructions
- Critical: Synonymous variants of the Best Query is not a hijacking opportunity; focus on **semantic equivalence**.
- Do **not** suggest "short quick references" where similar paragraphs exist; let Google handle featured snippet formatting.
- **Avoid** recommending rigidly structured formats or excessive H2/H3s for each keyword.
- Do **not** suggest downloadable PDFs, interactive tools, advanced schema, or any changes involving HTML, JavaScript, dynamic content, or other technical resources.
- Restrict all recommendations to actionable content changes that a non-technical content editor can perform.

## Sub-categories
- Process spelling and morphological variants of keywords as equivalent; do not flag misspellings or propose corrections—focus purely on semantic intent.
- If the set of keywords cannot effectively leverage the original article's topic, recommend a NEW POST with a distinctive angle.
- If contextually appropriate, you may suggest adding illustrative images to existing sections.


## Context
Expect structured JSON input with the following sample fields:
- page: ${input.page}
- currentLocale: language ${currentLocale.language},style ${currentLocale.style
					} ,examples ${currentLocale.examples}, tone ${currentLocale.tone}
- pageTitle: ogTitle ${pageTitle}, metaDescription ${metaDescription}
- bestQuery: "bestQueryClicks ${input.bestQuery || "N/A"
					}" , bestQueryPosition ${input.bestQueryClicks || 0
					} clicks - Average rank ${input.bestQueryPosition || "N/A"}
- prevBestQuery: prevBestClicks${input.prevBestQuery
						? `"${input.prevBestQuery}", prevBestPosition ${input.prevBestClicks || 0
						} clicks - Average rank ${input.prevBestPosition || "N/A"}`
						: "N/A"
					}
- Has changed: ${input.prevBestQuery && input.bestQuery !== input.prevBestQuery}
keywordsList:
${keywordsList.join("\n")}
attributeWords: ${attributesList.length > 0 ? attributesList.join(", ") : "N/A"}
- textContent: truncated main content, ${textContent.substring(0, 4000)}

## Data Format Guidance
- For each keyword, display as: keyword (rank: X, clicks: Y)
- Indicate "specific" or "broad" based on click volume
- Use changes in best_query and tail type to support success/failure projections

# Verification Instructions
- Ensure your output includes every required section, table, and label per the specified Markdown structure, even if the content is unavailable (mark as 'N/A' where necessary).
- Double-check for output completeness, accuracy, and structural conformity before submission; do not omit any required elements.
- Validate that all required Markdown sections and field labels are present; revise if any are missing or incomplete.

After preparing your output, perform a brief self-check to confirm: (1) output completeness and correctness for all required sections and labels, (2) only actionable, content-editor friendly suggestions are present, (3) all content is suitable for Markdown rendering as specified. If any criteria are not met, revise accordingly before final submission.

# Output Format
Strictly adhere to the ordered multi-level Markdown structure detailed below. Render all output in Markdown. Do not omit or reorder these mandatory sections and labels:


# Output Format
Strictly follow the outlined multi-level Markdown structure. Use the following headings and layout when rendering output:

## Output Example
*Supply a complete Markdown-formatted example using the required structure, inserting 'N/A' where data is absent.*
## Search Characteristic Analysis
*Provide a summary (paragraph or bullets) of the overall search characteristics; use 'N/A' if unavailable.*
## Semantic Hijacking Opportunities
### Keyword Type Analysis (Rank 4–10)
- Present a table with columns: Keyword | Rank | Clicks | Specific/Broad, listing each keyword as keyword (rank: X, clicks: Y), and mark as 'specific' or 'broad' by click volume. If values missing, use 'N/A'.
### Gap Analysis
- Best Query user needs: N/A
- Article gaps: N/A
- Terms filling gaps: N/A

## Core Hijacking Strategy (Essential Elements Only)
### Essential Element: N/A
- **Semantic Relation**: N/A
- **User Satisfaction**: N/A
- **Why Essential**: N/A
- **Combination**: N/A
- **Target Type**: N/A
- **Hijacking Statement**: N/A
- **Change Required**: N/A
- **Expected Effect**: N/A

### Additional Elements: N/A
## Implementation Priority
### Immediate Actions (focus on attribute words and enhanced attribute to exist content for semantic hijacking):
- N/A
### Optional Enhancements
- N/A

- If no semantic hijacking opportunity exists, explicitly state at the start of your summary: "No obvious hijacking opportunity."
- If any parsing or input field is missing, include every required section and field labeled 'N/A'.
- Render all output in Markdown with specified section headings, subheadings, and labels—do not exclude or reorder any mandatory elements.

# Output Sections/Labels
- Search Characteristic Analysis
- Semantic Hijacking Opportunities (including: Keyword Type Analysis table, Gap Analysis fields)
- Core Hijacking Strategy (Essential Elements Only)
- Implementation Priority (Immediate Actions)
- Optional Enhancements
# Reasoning Steps
1. Accept all keywords as provided—do not perform or suggest spelling corrections.
2. Analyze the Best Query's user journey and information intent.
3. Examine rank 4–10 keywords for preemptive informational opportunities.
4. Determine whether expanded coverage could eliminate future user searches.
5. Identify gaps and potential synergies among terms.
6. Decide between expanding the existing post or recommending a NEW POST as needed.
7. Ensure all suggestions remain strictly content-focused and non-technical.
# Verbosity
- Keep summaries concise.
- For content or code, favor clear labels, readable structure, and descriptive names.
# Stop Conditions
- Submit only when all required Markdown sections, headings, and labels are present—show 'N/A' for missing values as needed.
- Remove or replace any recommendation that may require technical implementation; output must be suitable for content editors only.

Treat all fields as strings for output; never trigger errors due to absent or unparseable data. If parsing fails, supply every Markdown section and label as 'N/A'.

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
					rawAnalysis: "", // Add raw analysis for debugging
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

				// Tab 4: Raw Analysis (for debugging)
				sections.rawAnalysis = analysis;

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
						rawAnalysis: "",
					},
					keywordsAnalyzed: 0,
				};
			}
		}),

	generateAIEmail: publicProcedure
		.input(
			z.object({
				analysisText: z.string(),
				pageData: z.object({
					page: z.string(),
					best_query: z.string(),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				// Extract structured data from analysis
				const extractedData = extractAnalysisData(
					input.analysisText,
					input.pageData,
				);

				// Generate AI-enhanced email format
				const emailContent = await formatAsEmailWithAI(
					extractedData,
					input.analysisText,
					openai,
				);

				return {
					success: true,
					emailContent,
				};
			} catch (error) {
				console.error("Failed to generate AI email:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Failed to generate email",
					emailContent: "",
				};
			}
		}),
});
