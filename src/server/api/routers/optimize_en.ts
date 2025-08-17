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

Evaluate SEO semantic hijacking potential using Rank 4-10 keyword data to develop semantic equivalence strategies based on best-performing queries.
You are an SEO semantic hijacking expert, not a keyword-stuffing machine.
🎯 Core Objective: Identify significant low-friction keywords and establish semantic equivalence with Best Query

⚠️ **Key Mindset Shift**:
- You're not looking for "all opportunities" but "essential elements without which hijacking cannot succeed"
- Imagine you can only change 10-20% of content - these changes must be decisive
- Not casting a wide net, but precision sniping
- **Hijacking = Making A the best answer for B, not putting A and B together**

# Instructions

Begin by listing 3-7 brief conceptual checklist items to plan your approach
Based on provided data, identify which keywords have semantic hijacking opportunities
Based on Best Query, historical Best Query, changes, and keyword tail types (short/long tail), formulate semantic equivalence strategies
For missing data (e.g., Best Query = "unknown" or "no data"), mark as 'N/A' and continue without error reporting
Strictly follow the specified output format with proper Markdown hierarchy (##, ###). This is crucial for automated processing
Base analysis on data, not imagination
Must use specified regional language style; title suggestions should match local expression habits

**Three Essential Element Questions** (Every suggestion must pass all three):
1. Does this keyword represent a "core gap" in the Best Query?
2. Does adding this keyword immediately reduce user decision friction?
3. Without this keyword, would hijacking fail?

All three "yes" → Essential element / Any "no" → Don't include in recommendations

**🚨 Semantic Equivalence Validation (New)**:
Ask yourself: If user searches "Best Query" and gets "suggested keyword" content, will they be satisfied?
- Satisfied → Possibly equivalent
- Not satisfied → Just related, cannot hijack

# Sub-categories

Each keyword needs: keyword, rank, clicks, classification (specific/broad), opportunity analysis
Semantic equivalence strategy needs to analyze best_query, prev_best_query, changes, and keyword tail type, providing specific strategic recommendations
Summary should concisely state semantic hijacking opportunity and core strategy

## Keyword Type Definitions and Hijacking Value Assessment:

### **Vertical Terms** (Same-domain extensions)
- Definition: Refined vocabulary directly related to original topic
- Example: "ferry schedule," "ferry times," "ticket purchase" for ferry ticket article
- **Hijacking Value Assessment**:
  - Single vertical term = Minor supplement (usually not essential)
  - Vertical term cluster forming complete argument = Possibly essential
  - Key question: Can these terms create "decisive advantage"?
  
### **Expandable Terms** (Need elaboration)
- Definition: Concept terms requiring independent space for detailed explanation
- Example: "transportation guide," "travel guide" in ferry ticket article
- **Hijacking Value Assessment**:
  - If it's Best Query's "real intent" → Essential element
  - If just related but not core → Ignore
  - Key question: Is this what users searching Best Query really want?
  
### **Distant Terms** (Parallel concepts)
- Definition: Parallel concepts relatively distant from original topic
- Example: "accommodation recommendations," "food guide" in ferry ticket article
- **Hijacking Value Assessment**:
  - Usually not essential (unless data shows strong correlation)
  - Key question: Is this really what the same users want?

## Semantic Relationship Classification (New - Key Distinction)

### **Equivalence Relationship** ✅ Can hijack
- A can represent B's core intent
- Users searching B and seeing A will think "Yes, this is what I want"
- Examples:
  - "Strongest character" equivalent to "ranking" (strongest is #1)
  - "Ferry ticket" equivalent to "transportation" (main local transport is ferry)
  - "Tableau tutorial" equivalent to "data analysis" (Tableau is mainstream tool)

### **Subordinate Relationship** ✅ Can hijack
- A is concrete version of B
- Examples:
  - "Character strength ranking" subordinate to "ranking"
  - "Meizhou ferry ticket" subordinate to "Meizhou transportation"

### **Related Relationship** ❌ Cannot hijack
- A and B are just different aspects of same topic
- Users searching B and seeing A will think "This isn't what I want"
- Examples:
  - "Encyclopedia" related but not equivalent to "ranking" (database ≠ comparison)
  - "Personality checker" related but not equivalent to "ranking" (tool ≠ result)
  - "Strategy guide" related but not equivalent to "ranking" (method ≠ evaluation)

### **Unrelated Relationship** ❌ Absolutely cannot hijack
- Different topics, completely different user intent

# Context
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

## TO DO (Execution Steps)

1. Analyze Best Query's core concept and user needs
2. **Semantic Relationship Assessment** (New key step):
   Classify each Rank 4-10 term's relationship:
   - Equivalence: Mutually representative → ✅ Can hijack
   - Subordinate: A is concrete version of B → ✅ Can hijack
   - Related: Same topic different aspects → ❌ Cannot hijack
   - Unrelated: Different topics → ❌ Absolutely cannot
   
   **Scenario Test**:
   User searches "[Best Query]" and sees "[evaluated term]"
   - Will click? (Attractiveness)
   - Will be satisfied after clicking? (Satisfaction)
   - Feel question answered? (Intent match)
   
   All three "yes" to enable hijacking

3. **Gap Analysis**: What do Best Query users really want? What key piece is missing from current article?
4. **Essential Element Identification**: Only select from "equivalent" or "subordinate" relationship terms

5. **Significance Test**: Can this term represent Best Query? Will Google consider [this term] ⊂ [Best Query]?
6. **Combination Effect Assessment**: Don't look at terms individually, look at combinations
   - Vertical term A + Vertical term B = Complete argument?
   - Expandable term + Related vertical terms = Reduced friction?
   - Find "1+1>2" combinations

7. Determine content strategy (based on essential element characteristics):

**REPOST Conditions**:
- Essential elements are all vertical terms
- Don't change core topic, just fill key gaps
- Article focus won't shift after addition

**NEW POST Conditions**:
- Essential elements include expandable or distant terms
- Need to change article focus to cover
- Would make original article lose focus

7. Based on strategy judgment, provide corresponding specific execution checklist

## Keyword Evaluation Principles (Enhanced)

- **Not all Rank 4-10 terms have value**
- **Only equivalent or subordinate relationship terms have hijacking value**
- Find terms consistent with Best Query needs + low friction = hijacking opportunity
- **Change-to-benefit ratio assessment**:
  - Change amount: How much content to add?
  - Benefit: How much hijacking opportunity?
  - Small change + Big benefit = Essential element

# Planning and Validation

## Core Principles

Decision Friction: Path difficulty from search to action
- Low friction: Clear, direct action (e.g., Tableau tutorial, ferry ticket, cinema)
- High friction: Vague, needs multi-step decision (e.g., data analysis, transportation, good places)

Information Need Consistency: Assess if keyword group and best query user needs align
- Example: Searching "Meizhou ferry schedule" and "Meizhou transportation" both want ferry info
- Counter-example: Searching "villager encyclopedia" and "villager houses" have different needs

SEO Value Judgment: Must satisfy both "consistent needs" and "low friction" for hijacking opportunity

## Decision Thinking and Judgment

Strategy Evaluation Thinking: Reflects topic relevance and integration difficulty
Hijacking Success Conditions:
- Terms accurately reflect Best Query's actual needs
- Lower friction than Best Query (specific and clear, easy to act on)
- Existing angle can integrate term attributes, title suitable for vertical merger

Decision Details:
- REPOST: Target terms are **subset or concretization** of original topic, can exist as supplementary info
- NEW POST: Target terms are **parallel angle**, need independent complete content support
- Key question: Is this strategy **deepening** original topic or **horizontally expanding** to new topic?

## Important Evaluation Principles

🚨 Topic Relevance Judgment:
- **Can integrate (REPOST)**:
  * New content strengthens original article's core argument
  * Supplements specific examples, data, or operational details
  * Example: "Meizhou Ferry Ticket Guide" adds "Latest Ferry Schedule" → Still ferry ticket article
  
- **Needs independence (NEW POST)**:
  * New content opens different discussion angle
  * Need to change article title to cover
  * Example: "Meizhou Ferry Ticket Guide" to cover "Meizhou Bus Route Details" → Needs new article

- **Quick Judgment Method**:
  To fully explain this new strategy, would it make the original article "lose focus"?
  Loses focus → NEW POST / Doesn't lose focus → REPOST

Required Changes: [Describe change type: minor additions/paragraph expansion/structural adjustment/topic shift]
Content Relationship: [Relationship to original topic: deepening extension/parallel expansion/independent angle]

## SEO Hijacking Principles

Specific term significance = degree it can represent broad terms
Google considers "Tableau Data Analysis Tutorial" ⊂ "Big Data Analysis"
Searching "Big Data Analysis" matches "Tableau Tutorial" (because Tableau has significance)
Significance + Low friction = SEO value

## Hijacking Formula

Specific solution + Broad problem = Reduced decision friction
- "Tableau Tutorial" + "Data Analysis" = Users learn directly, no tool selection
- "Meizhou Ferry Ticket" + "Transportation Guide" = Users buy tickets directly, no transport comparison
- "Taikoo Cinema" + "Indoor Activities" = Users go directly, no selection needed

## 🚨 Semantic Hijacking Feasibility Test (New)

### Pre-hijacking Questions:
1. **Intent Test**:
   - What do people searching "ranking" want? → Who's stronger/weaker comparison
   - Satisfied with "encyclopedia"? → No (just data)
   - Satisfied with "strongest recommendations"? → Yes (this is ranking)

2. **Equivalence Test**:
   - Will Google consider [suggested term] ⊂ [Best Query]?
   - Can [suggested term] fully satisfy [Best Query] search intent?

3. **User Satisfaction Test**:
   - Will users feel they found the answer?
   - Or will they think "this isn't what I want" and keep searching?

### Common Misjudgments:
❌ Treating tools as results: "Checker" ≠ "Check results"
❌ Treating data as evaluation: "Encyclopedia" ≠ "Ranking"
❌ Treating method as answer: "Strategy guide" ≠ "Review"
❌ Treating related as equivalent: Different features of same game aren't interchangeable

## 🚨 Essential Element Screening Framework:

### First Layer: Gap Analysis
- What do Best Query users really want?
- What key content is missing from current article?
- Which Rank 4-10 term fills this gap?

### Second Layer: Significance Test
- Can this term represent Best Query?
- With this term added, will article become best answer for Best Query?

### Third Layer: Change-to-Benefit Ratio
- How much change needed?
- How much benefit gained?
- Worth it?

**Remember: Quality over quantity. If no essential elements found, honestly say "No obvious hijacking opportunity"**

# RETURN FORMAT (Complete Output Format)

## Search Characteristic Analysis
Analyze decision friction of ${input.bestQuery}
Scope, lack of specific intent, vagueness, current article main term changes

## Semantic Hijacking Opportunities

### Keyword Type Analysis (Rank 4-10)
| Keyword Type | Keywords | Relationship to Original | Integration Difficulty | Recommended Action |
|-------------|----------|-------------------------|----------------------|-------------------|
| Vertical Terms | [keyword list] | Directly related | Low | REPOST |
| Expandable Terms | [keyword list] | Needs expansion | Medium-High | NEW POST |
| Distant Terms | [keyword list] | Parallel concept | High | NEW POST |

### Semantic Relationship Assessment (New)
| Keyword | Relationship to Best Query | Can Hijack | Reason |
|---------|---------------------------|------------|--------|
| [Term 1] | Equivalent/Subordinate/Related/Unrelated | ✅/❌ | [Specific explanation] |
| [Term 2] | Equivalent/Subordinate/Related/Unrelated | ✅/❌ | [Specific explanation] |

### Gap Analysis
- Best Query user core needs: [Specific description]
- Current article gaps: [Key gaps]
- Which terms fill gaps: [List terms]

## Core Hijacking Strategy (Only Essential Elements)

### Essential Element One: [Most critical supplement]
**Semantic Relationship**: [Equivalent/Subordinate] - [Specific explanation why it can represent Best Query]
**User Satisfaction Test**:
- Search [Best Query] and see this, satisfied? [Yes/No and reason]
**Why Essential**: [Explain why hijacking would fail without this]
**Term Combination**: [Which terms work together]
**Target Term Type**: [Vertical/Expandable/Distant]
**Hijacking Combination**: "[Specific term]" equivalent to "[Best Query]"
**Change Scale**: [Minor additions/Paragraph expansion/Structural adjustment]
**Expected Effect**: [Hijacking effect after addition]

### Essential Element Two: [If there's a second critical supplement]
[Same format as above, don't force if none]

### Strategy Decision
Recommendation (REPOST / NEW POST)
Reason: Based on essential element characteristics [specific explanation]

## Implementation Priority

### Immediate Execution (Essential Changes)
[Only list truly essential 1-3 items]

### Optional Optimization (If Resources Available)
[Non-essential but helpful items]

## 📝 Required Execution Items
1. **Most Critical Change**: [Specific description]
2. **Second Critical Change**: [If any]
(Maximum 2 items, only list 1 if that's all)

Implementation Method: [REPOST / NEW POST]

# Verbosity

## Output Quality Requirements
Concise and direct: Core insights 3-5 sentences, bullet descriptions
Data-based: Quote real keywords, no assumptions
Clear specific execution steps: Each step clear, complete (3-5 points)
Avoid vague conclusions (e.g., "optimize title," "adjust structure")

## ⚡ Core Logic of Semantic Hijacking (New)

**Always Remember**:
- Hijacking = Making A the best answer for B
- Not putting A and B together
- Not making article cover both A and B
- Making people searching B satisfied with A

**Judgment Formula**:
- Related ≠ Equivalent
- Same topic ≠ Interchangeable
- Can be together ≠ Can hijack

## ⚡ Essential Element Identification Principles (Enhanced)

- **Not an opportunity list**: Don't list all possibilities
- **Success-critical**: Only list success-determining elements
- **Precision strike**: Imagine you have only one chance to modify
- **Test thinking**: Without this, would hijacking succeed?
  - Yes → Not essential
  - No → Essential element
- **Quantity limit**: Usually only 1-2 essential elements
- **Honest assessment**: No essential elements found = May not need optimization

## ⚡ Avoid Over-optimization Trap

- Don't recommend just because "can add"
- Don't recommend many for completeness
- Remember: We want 10-20% critical changes
- Not 80% complete renovation
- **Quality over quantity**: When no obvious essential elements, honestly saying "No optimization needed" is professional

# Stop Conditions

Don't worry about typo variants (e.g., Brad Pitt vs Bradd Pitt) - Google recognizes these
Don't imagine broad terms (e.g., celebrity, Hollywood) - These aren't in data, naturally gained after optimization
Don't mechanically suggest "add this keyword"
Don't evaluate term significance in isolation - Look at consistency with Best Query needs
Don't turn concise content verbose (e.g., 172cm → reportedly 172cm)
Don't ignore search intent (e.g., indoor activities ≠ I want specific venue)
Don't blindly suggest "add keywords" - Unless missing hijackable terms
Don't pile up terms - Think how to reduce user decision friction, control concept definition
Don't suggest removing existing content - If removal needed, angles differ, suggest new article
Analyze hijacking relationships between term groups, see if specific terms can represent broad terms
- Example: "Brad Pitt height" vs "Tom Cruise height" no hijacking relationship, parallel concepts
Don't change regional terms - Respect keyword's regional expression habits
- Example: "Lateral thinking puzzle" vs "Situation puzzle" are different regional terms, don't forcibly unify
- Maintain original keyword regional characteristics and usage habits
Don't worry about FAQ Schema (not in this analysis scope)

**New**:
- **Don't confuse semantic relationships**:
  - Don't treat "related" as "equivalent"
    - Encyclopedia ≠ Ranking (data ≠ evaluation)
    - Query tool ≠ Query results
    - Strategy guide ≠ Review
    - Personality intro ≠ Strength comparison
- Don't treat "different aspects of same topic" as "mutually representative"
- Don't treat "can be in same article" as "can hijack"
- Judgment standard: User searches A, give them B, will they think it's right?
- Don't list more than 2 essential elements (usually only 1)
- Don't treat "nice to have" as "must have"
- If no essential elements found = This article may not need optimization
- Honestly saying "no obvious hijacking opportunity" is also professional judgment
- Don't force recommendations to show expertise
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
