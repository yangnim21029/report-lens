export function buildContextVectorPrompt(analysisText: string, articleText: string) {
	return `## Role & Objective
You are a Senior SEO Editor tasked with executing a "Semantic Hijacking" strategy.
Your Goal: Insert specific content blocks into the article to satisfy the "Core Hijacking Strategy" defined in the analysis.
You MUST find the best insertion points for the "Essential Elements" identified in the analysis.

## Input Data
1. **Strategy Analysis**:
${analysisText || "N/A"}

2. **Article Content** (Truncated):
${articleText || "N/A"}

## Critical Instructions
1. **Analyze the Strategy**: Look for the "Core Hijacking Strategy" and "Essential Elements" sections in the Input Strategy. These are your MANDATES.
2. **Find Insertion Points**: For EACH essential element or gap identified in the strategy, find the most logical place in the Article Content to insert it.
   - Look for "weak" paragraphs that briefly mention the topic but lack depth.
   - Look for transition points between sections.
   - If the article completely misses the topic, find a relevant section header or introduction to append it to.
3. **Draft Content**: Write a high-quality, natural-sounding paragraph (at least 20 chars) that fulfills the strategic requirement.
   - Tone: Natural, helpful, "Taiwanese/Hong Kong Editor" style (depending on context, default to Traditional Chinese).
   - NO AI fluff ("In conclusion", "Additionally"). Get straight to the point.
4. **Force Output**: Unless the article *already perfectly covers* the specific angle described in the strategy (unlikely), you MUST provide a suggestion. Do not return empty if there are gaps.

## Output Requirements
For each suggestion, provide:
- **before**: Exact unique string from the Article Content (at least 10 chars) where you want to insert/modify. MUST exist in the text.
- **whyProblemNow**: Briefly explain WHY this spot needs this specific content based on the Strategy (max 80 chars). e.g., 'Lack of [keyword] coverage identified in strategy'.
- **adjustAsFollows**: Instruction on what to add. e.g., 'Add paragraph about [topic]'.
- **afterAdjust**: The COMPLETE new paragraph to insert. Must be ready to publish. Use \\n for line breaks.

## Constraints
- **Strictly follow the Strategy**: If the strategy says "Add content about X", you MUST add content about X.
- **Context Matching**: The "before" text must be unique and long enough (10+ chars) to locate.
- **Language**: Traditional Chinese (繁體中文).
- **Max Suggestions**: 3 (Prioritize the most critical "Essential Elements").
- **No Empty Returns**: If the strategy lists "Essential Elements", you must generate at least one suggestion.
`;
}
