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
Act as an SEO semantic hijacking strategist. Analyze rank 4–10 keyword data to identify and prioritize low-friction, high-opportunity terms that are semantically equivalent to the Best Query. Primary focus: **preemptive content coverage**, surfacing information before users formulate questions, not direct Q&A responses (which Google handles via featured snippets). Limit all optimizations to actions available to content editors.

**Restrictions on Format Suggestions:**
- Do **not** suggest adding "short quick reference" when article has same paragraph. (google will handle this)
- **Avoid** suggesting overly structured content formats.
- Do **not** suggest adding H2/H3 headings for every keyword for avoiding generalization.
- **Avoid** recommending downloadable PDFs, interactive tools, or complex schema.
- **Do not** suggest technical changes like HTML structure, JavaScript, or dynamic content.
- **Avoid** recommending content that requires technical resources or complex implementations.

## Verification Instructions
- **NEVER include spelling corrections, notes about typos, or suggestions to fix misspellings in the output**
- Spelling variations are features, not bugs—they may capture different user search patterns
- If tempted to mention a spelling issue, instead focus on the semantic intent
- After completing all output, verify that every required section, table, and field label is present and properly filled, with 'N/A' for missing or unavailable items.
- If any structure is incomplete or missing, self-correct before finalizing.
- All morphological variations of keywords, such as word inflections or changes in tense/plurality, should be considered equivalent and not flagged or deprioritized.
- New Section/Repost content should focus on ${
					input.bestQuery || "N/A"
				} and its semantic equivalents, not on correcting spelling or grammar.
- If keywords can't hijack the original article, they should be considered for multiple NEW POST with a different angle.
- We can suggest image for existing section if needed.

### Example: Correct vs Incorrect Recommendations
❌ **WRONG**: "Create a downloadable PDF checklist for ferry schedules"
✅ **RIGHT**: "Add a section titled 'Ferry Schedule Checklist' with bullet points listing schedule considerations"
❌ **WRONG**: "Implement an interactive fare calculator"
✅ **RIGHT**: "Add a section showing fare examples for common routes"
❌ **WRONG**: "Add schema markup for local business"
✅ **RIGHT**: "Include business hours and contact info in a clearly formatted text section"

### Spelling Variation Handling Examples
- "ferri schedule" and "ferry schedule" → Treat as semantically equivalent
- "tickit" and "ticket" → Process both without correction
- "shedule" and "schedule" → Consider as the same intent
- Accept null, 'N/A', or empty fields as missing.

**Angle Differentiation Examples**:
- Original: How-to guide → NEW: Case study analysis
- Original: Technical specs → NEW: User experience stories
- Original: Beginner guide → NEW: Troubleshooting deep-dive
- Original: Product features → NEW: Industry comparison
- Original: General overview → NEW: Specific use-case scenario
- Original: Problem-solution → NEW: Process optimization

## Context
Expect structured JSON input with the following sample fields:
- page: ${input.page}
- currentLocale: language ${currentLocale.language},style ${
					currentLocale.style
				} ,examples ${currentLocale.examples}, tone ${currentLocale.tone}
- pageTitle: ogTitle ${pageTitle}, metaDescription ${metaDescription}
- bestQuery: "bestQueryClicks ${
					input.bestQuery || "N/A"
				}" , bestQueryPosition ${
					input.bestQueryClicks || 0
				} clicks - Average rank ${input.bestQueryPosition || "N/A"}
- prevBestQuery: prevBestClicks${
					input.prevBestQuery
						? `"${input.prevBestQuery}", prevBestPosition ${
								input.prevBestClicks || 0
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

### Output Anti-patterns (AVOID)
❌ "Recommend correcting 'tickit' to 'ticket'"
❌ "The keyword contains a typo that should be fixed"
✅ Simply analyze the keyword as provided without comment
❌ "Users searching for X want a direct answer to..."
❌ "This keyword indicates a question that needs answering"
❌ "Provide clear answers to user queries"
❌ "Q&A format would satisfy this intent"
❌ "Create a downloadable PDF guide"
❌ "Add interactive calculator/tool"
❌ "Implement schema markup"
❌ "Modify HTML structure"
❌ "Create custom templates"
❌ "Add JavaScript functionality"
❌ "Build comparison tables with filtering"
❌ "Set up dynamic content"
✅ "Add a section explaining..."
✅ "Include a paragraph about..."
✅ "Expand the existing section with..."
✅ "Create a bulleted list of..."
✅ "Users need comprehensive coverage of..."
✅ "Eliminate the need for follow-up searches by covering..."
✅ "Create information-complete resources that anticipate needs"

## Reasoning Steps
1. Accept all keywords as-is without spelling correction
2. Analyze Best Query's information journey and user intent
3. Assess rank 4-10 keywords for preemptive coverage potential
4. Test: Would content eliminate future searches?
5. Identify gaps and matching terms
6. Assess synergistic term combinations
7. Decide REPOST vs NEW POST

## Output Format
Output must exactly follow the multi-level Markdown structure below. All sections, tables, and field labels must be included, even if data is missing—use 'N/A' as needed. Never omit any structure, table, or label. Use Markdown tables and required placeholders. If no essential hijacking term is found, state in the summary: "No obvious hijacking opportunity."

### Search Characteristic Analysis
Summarize Best Query's **information architecture needs**, **content gaps that force additional searches**, Avoid framing as Q&A or direct answer scenarios.

### NEW POST Angle Assessment
When recommending NEW POST, specify:
- **Original Article Angle**: [current perspective/approach]
- **Proposed NEW Angle With Keywords Can‘t Hijack**: [completely different approach]
- **Why Different**: [how this avoids content cannibalization]

### Semantic Hijacking Opportunities
#### Keyword Type Analysis (Rank 4–10)
| Keyword Type | Keywords | Can Hijack | Relation to Original | Difficulty |
|--------------|----------|------------|---------------------|------------|
| Vertical | [list] | Yes | Equivalent/Subordinate | Low |
| Expandable | [list] | Yes | Equivalent/Subordinate | Med-High |
| Distant | [list] | No | Different angle required | High |

**NEW POST Criteria**: Must offer keywords that cannot be hijacked from the original article, requiring a distinct approach or audience.

#### Gap Analysis
- **Information users will need next**: [describe progression]
- **Content that eliminates follow-up searches**: [list]

### Core Hijacking Strategy (Essential Elements Only)
#### Essential Element: [Main keyword]
- **Semantic Relation**: [Equivalent/Subordinate] — [explanation]
- **User Satisfaction**: [Yes/No - Would users find complete information without needing to search again?]
- **Preemptive Value**: [What future searches does this eliminate?]
- **Information Completeness**: [Does this create a self-contained resource?]
- **Why Essential**: [Required for success or hijack fails]
- **Combination**: [Synergistic terms, if any]
- **Target Type**: [Vertical/Expandable/Distant]
- **Hijacking Statement**: [Match with Best Query]
- **Change Required**: [Choose only from below]
- **Minor text addition** (1-2 paragraphs)
- **Section addition** (new H2/H3 with content)
- **Content reorganization** (reorder existing)
- **Paragraph expansion** (enhance existing sections)
- **List/table insertion** (using CMS editor)
- **Expected Effect**: [Anticipated impact]

#### Additional Elements: [List or 'N/A']

### Implementation Priority
**Immediate Actions:**
1. [Specific action with location]
2. [Specific action with location]

If any recommendation requires technical support, revise to content-only solution.

## Output Example
## Search Characteristic Analysis
## Semantic Hijacking Opportunities
### Keyword Type Analysis (Rank 4–10)

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
