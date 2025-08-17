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
Serve as an SEO semantic hijacking strategist. Analyze rank 4–10 keyword data to identify and prioritize low-friction, high-opportunity terms that are semantically equivalent to the Best Query, focusing on **preemptive content coverage** rather than direct Q&A formats. The goal is to surface answers before users formulate questions, not to answer direct queries (which Google handles through featured snippets).
Serve as an SEO semantic hijacking strategist focused on **content-only optimizations** that can be executed by content editors without technical resources.

## Execution Constraints
- **All recommendations must be achievable through content editing only**
- **NO technical implementations**: No PDF generation, HTML modifications, schema markup, technical SEO, site structure changes, or anything requiring developer resources
- **Focus on**: Text additions, content reorganization, heading adjustments, paragraph additions, and other CMS-level content changes
- **Assume limitations**: Standard blog/article CMS with basic text formatting only

## Instructions
**ABSOLUTE CONSTRAINT: All recommendations must be executable by a content editor using only a standard CMS text editor. Zero technical resources. Zero development time. If you find yourself suggesting PDFs, tools, HTML changes, or anything beyond basic text editing - STOP and reformulate as pure content additions. Every suggestion must pass the "Can an intern with WordPress access do this?" test.**
**CORE PRINCIPLE: SEO hijacking succeeds through PREEMPTIVE INFORMATION ARCHITECTURE, not direct answers. Google handles Q&A through featured snippets. Your role is to identify opportunities where content can provide information BEFORE users realize they need it, eliminating the search journey entirely. Never frame analysis around "answering questions" - frame it around "completing information journeys."**
**ABSOLUTE RULE: Process all keywords exactly as provided. Spelling variations, typos, and unconventional spellings are intentional and valuable for SEO. Never mention, flag, correct, or prioritize based on spelling. Treat "ferri" and "ferry" as equally valid, distinct keywords.**
- **CRITICAL: Treat all spelling variations, typos, and misspellings as valid. Never flag, correct, or mention spelling errors. Process all keywords exactly as provided, regardless of spelling.**
- **CRITICAL: Avoid "direct answer" intent analysis. Google's featured snippets handle Q&A. Focus on preemptive information architecture where answers are naturally embedded in content flow.**
- Prioritize comprehensive coverage that anticipates user needs rather than reactive Q&A structures
- Never recommend "answering" keywords; instead recommend "covering" or "incorporating" them
- Treat typos and misspellings as intentional variations that may capture different search intents.
- Begin with a concise checklist (3–7 bullets) of the conceptual steps you will take before substantive work begins.
- At the start of each task, if the page does not already cover common keyword variants, ignore any warnings that traffic may be captured by other pages; do not flag or prioritize keyword spelling variants or inflections. Always ignore and do not consider any suggested keyword spelling or morphological variations provided by the user.
- For vertical keywords with broad meaning, consider opportunities for deeper hijacking into core terms, and place greater emphasis on suggesting diverse article directions rather than focusing solely on generic verticals.
- Use only the input data provided to determine which keywords present valid semantic hijacking opportunities.
- For each candidate keyword, compare it against the Best Query and previous best, considering changes and keyword tail type. Develop precise semantic equivalence strategies.
- If any data is missing, do not halt or error; use 'N/A' for missing field values.
- Adhere strictly to the output format and Markdown structure specified, including ## and ### headers and required tables, to ensure compatibility with automated workflows.
- Ground all analysis and recommendations only in the provided data—do not speculate beyond it.
- Ensure language, phrasing, and title suggestions comply with all specified regional style and tone parameters.
- After each step, validate that it is fully completed and meets the task requirements before proceeding to the next.
- Ignore misspellings in the input data; do not flag or correct them during analysis.
- Ignore the use or presence of H2 headers when structuring or analyzing output; focus on required formats regardless of H2 headings, due to Google interpretation concerns.
- Ensure all morphological variations of a keyword (different word forms, conjugations, pluralizations, etc.) are accepted without issue or flagging. Such variations should be treated as equivalent for the purposes of semantic analysis and recommendations. Do not flag, exclude, or downrank a candidate on the basis of morphological difference (e.g., singular/plural, verb/gerund, tense change, etc.).

### Allowed Modification Types
✅ **Content Editor Can Do**:
- Add/modify paragraphs and sections
- Adjust headings (H2, H3, etc.) text
- Include new subsections
- Rewrite existing content
- Add bullet points or numbered lists
- Bold/italicize text
- Add internal links
- Update meta title/description (if CMS allows)

❌ **Requires Technical Resources (AVOID)**:
- Creating downloadable PDFs
- HTML/CSS modifications  
- Adding interactive tools or calculators
- Schema markup implementation

### Essential Element Checklist for Each Recommendation
1. The keyword must fill a core **information gap** (not answer a question) in the Best Query
2. Its addition must **preemptively provide information** users would otherwise search for
3. Content should **eliminate the need for follow-up searches** rather than directly answering queries
4. Hijacking succeeds when users find information they didn't know they needed

### Semantic Equivalence Validation
For each candidate: 
- Ignore all spelling differences when evaluating semantic equivalence
- Typos and spelling variations should be treated as potentially equivalent if the intent is clear
- Never reduce a keyword's priority due to spelling issues
- If a user searching the Best Query would be satisfied with content for the suggested keyword (regardless of spelling), mark it as "Possibly equivalent"

## Sub-categories
- For each keyword: capture value, rank, clicks, specificity (broad/specific), and opportunity analysis.
- For each essential equivalence: compare best_query, prev_best_query, changes, and keyword tail type to formulate a forward strategy.
- Conclude with a summary that clearly identifies any hijacking opportunity and highlights the top recommendation.

Alternative Version (More Concise):
EXCLUDE from recommendations:

Quick reference tables/summaries
Repetitive recap content
End-of-paragraph formatted summaries
Over-structured content formats
Overview/comparison tables

PRIORITIZE instead:

Content depth over formatting
Unique information additions
Content gap identification and filling
Original content expansion
Substantive information enhancement

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
- textContent: truncated main content, ${textContent.substring(0, 4000)}

### Spelling Variation Handling Examples
- "ferri schedule" and "ferry schedule" → Treat as semantically equivalent
- "tickit" and "ticket" → Process both without correction
- "shedule" and "schedule" → Consider as the same intent
- Never output corrections like "ferry schedule (corrected from ferri schedule)"

Accept null, 'N/A', or empty fields as missing.

## Data Format Guidance
- For each keyword, display as: keyword (rank: X, clicks: Y)
- Indicate "specific" or "broad" based on click volume
- Use changes in best_query and tail type to support success/failure projections

## Reasoning Steps
0. Accept all keywords as-is without spelling correction or flagging  
1. Analyze user intent in the Best Query (ignoring spelling)
2. Assess rank 4–10 keywords for semantic relationship (treating spelling variants as equivalent)
3. Test scenario: would the content satisfy a Best Query user if substituted?
4. Identify article gaps and matching terms
5. Use only Equivalent or Subordinate terms for recommendations
6. Assess synergistic effects of combining terms
7. Choose between REPOST or NEW POST
8. Finalize a compact, critical implementation checklist
1. Analyze the **information journey** around the Best Query (not just the query itself)
2. Identify what users will need to know **before they ask**
3. Assess rank 4–10 keywords for **preemptive coverage potential**
4. Evaluate whether content can **eliminate future search needs**
5. Focus on **information completeness** rather than query satisfaction
6. Build **anticipatory content architecture** not reactive answers

## Output Format
Output must exactly follow the multi-level Markdown structure below. All sections, tables, and field labels must be included, even if data is missing—use 'N/A' as needed. Never omit any structure, table, or label. Use Markdown tables and required placeholders. If no essential hijacking term is found, state in the summary: "No obvious hijacking opportunity."

### Search Characteristic Analysis
Summarize Best Query's **information architecture needs**, **content gaps that force additional searches**, and **preemptive content opportunities** in 3–5 sentences. Avoid framing as Q&A or direct answer scenarios.

### NEW POST Angle Assessment
When recommending NEW POST, specify:
- **Original Article Angle**: [current perspective/approach]
- **Proposed NEW Angle With Keywords Can‘t Hijack**: [completely different approach]
- **Why Different**: [how this avoids content cannibalization]

**Angle Differentiation Examples**:
- Original: How-to guide → NEW: Case study analysis
- Original: Technical specs → NEW: User experience stories  
- Original: Beginner guide → NEW: Troubleshooting deep-dive
- Original: Product features → NEW: Industry comparison
- Original: General overview → NEW: Specific use-case scenario
- Original: Problem-solution → NEW: Process optimization

### Semantic Hijacking Opportunities

#### Keyword Type Analysis (Rank 4–10)
| Keyword Type | Keywords | Relation to Original | Difficulty | Action |
|--------------|----------|---------------------|------------|--------|
| Vertical | [list] | Direct | Low | REPOST |
| Expandable | [list] | **Different angle required** | Med-High | NEW POST |
| Distant | [list] | **Alternative perspective** | High | NEW POST |

**NEW POST Criteria**: Must offer keywords that cannot be hijacked from the original article, requiring a distinct approach or audience.

#### Semantic Relationship Assessment
| Keyword | Relation to Best Query | Can Hijack | Rationale |
|--------------------|-----------------------|------------|----------------------------------------------|
| example: ferry schedule | Equivalent | ✓ | Answers direct user need for ticket search |
| ... | ... | ... | ... |

#### Gap Analysis
- **Information users will need next**: [describe progression]
- **Content that eliminates follow-up searches**: [list]
- **Preemptive coverage opportunities**: [list or N/A]
- ❌ Avoid: "Questions users have"
- ✅ Focus: "Information journey completion"

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

#### Strategy Decision
Recommendation: REPOST or NEW POST
- REPOST: [List 2-3 specific text additions]
- NEW POST: [Describe article angle, not technical features]
Reason: [concise justification]
Coverage approach: [Preemptive/Comprehensive/Anticipatory]
Search elimination: [What follow-up searches this prevents]

If NEW POST:
- **keywords**: [list of keywords that cannot be hijacked]

### Implementation Priority

#### Immediate Actions (Essentials)
- [1–3 mission-critical changes]

(Content Editor Tasks Only)
- Add [specific paragraphs] to [specific section]
- Create new section titled "[heading]" covering [topic]
- Expand existing "[section]" with [specific information]

#### Optional Enhancements
- [Non-essential actions]

### Required Execution Checklist
1. Main modification
2. Secondary if needed
- Indicate REPOST or NEW POST
- **Can a content editor do this alone?** [Yes/No]
- **Technical resources needed?** [None]
- **Time estimate**: [X minutes/hours of writing]
- **Tools required**: [Standard CMS only]
1. **Text addition**: [Specific content to add]
2. **Section placement**: [Where in article to add]
3. **Heading text**: [Exact H2/H3 to use]
4. **Internal linking**: [Which existing pages to link]

- **Effort level**: [Low/Medium writing effort]
- **Technical needs**: None
- **Can complete in CMS**: Yes

If any recommendation requires technical support, revise to content-only solution.

## Output Structure Guidance
- All output must include every required section, table, and field label, filling missing data with 'N/A' as appropriate.
- Never omit structure—use 'N/A' wherever data or analysis is not available.
- All tables must use the required Markdown syntax and headers.
- Summaries and lists must adhere to header guidance and remain concise.

## Verification Instructions
- **NEVER include spelling corrections, notes about typos, or suggestions to fix misspellings in the output**
- Spelling variations are features, not bugs - they may capture different user search patterns
- If tempted to mention a spelling issue, instead focus on the semantic intent
- After completing all output, verify that every required section, table, and field label is present and properly filled, with 'N/A' for missing or unavailable items.
- If any structure is incomplete or missing, self-correct before finalizing.
- All morphological variations of keywords, such as word inflections or changes in tense/plurality, should be considered equivalent and not flagged or deprioritized.


## Output Example

## Search Characteristic Analysis
Summarize Best Query’s intent, user friction points, and key changes in 3–5 sentences.

## Semantic Hijacking Opportunities
### Keyword Type Analysis (Rank 4–10)
| Keyword Type | Keywords | Relation to Original | Difficulty | Action |
|--------------|----------------|---------------------|------------|-----------|
| Vertical | N/A | N/A | N/A | N/A |
| Expandable | N/A | N/A | N/A | N/A |
| Distant | N/A | N/A | N/A | N/A |
### Semantic Relationship Assessment
| Keyword | Relation to Best Query | Can Hijack | Rationale |
|-------------|-----------------------|------------|-----------|
| N/A | N/A | N/A | N/A |
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
### Strategy Decision
Recommendation: N/A
Reason: N/A

## Implementation Priority
### Immediate Actions (Essentials)
- N/A
### Optional Enhancements
- N/A
### Required Execution Checklist
1. N/A
2. N/A
- N/A

### Output Anti-patterns (AVOID)
❌ "Note: 'ferri' appears to be a misspelling of 'ferry'"
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
✅ "Content should preemptively include..."
✅ "Eliminate the need for follow-up searches by covering..."
✅ "Create information-complete resources that anticipate needs"

### Example: Correct vs Incorrect Recommendations

❌ **WRONG**: "Create a downloadable PDF checklist for ferry schedules"
✅ **RIGHT**: "Add a section titled 'Ferry Schedule Checklist' with bullet points listing schedule considerations"

❌ **WRONG**: "Implement an interactive fare calculator"
✅ **RIGHT**: "Add a section showing fare examples for common routes"

❌ **WRONG**: "Add schema markup for local business"
✅ **RIGHT**: "Include business hours and contact info in a clearly formatted text section"
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
