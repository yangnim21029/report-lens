import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Direct implementation of analyze: fetch page HTML, extract text, build prompt, call OpenAI.
export async function POST(req: Request) {
  try {
    const input = await req.json();
    const page: string = String(input?.page || "");
    if (!page) return NextResponse.json({ success: false, error: "Missing page" }, { status: 400 });

    // Step 1: Fetch article HTML
    const contentResponse = await fetch(page, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RepostLens/1.0)" },
      cache: "no-store",
    });
    if (!contentResponse.ok) {
      return NextResponse.json({ success: false, error: `Fetch failed: ${contentResponse.status}` }, { status: 502 });
    }
    const html = await contentResponse.text();

    // Step 2: Extract main content
    const articleMatch = html.match(/<article[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/article>/i);
    const mainDivMatch = html.match(/<div[^>]*class=\"[^\"]*pl-main-article[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i);
    const raw = articleMatch?.[1] || mainDivMatch?.[1] || html;
    const textContent = toPlainText(raw).slice(0, 6000);

    // Step 3: Build concise prompt (shortened from original)
    const bestQuery = input?.bestQuery ?? null;
    const keywordsList = [input?.rank4, input?.rank5, input?.rank6, input?.rank7, input?.rank8, input?.rank9, input?.rank10]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are an SEO strategist. Analyze the article text and the provided SERP signals to produce a structured optimization brief.

Input Page: ${page}
Best Query: ${bestQuery ?? "N/A"}
Rank 4-10 keywords (with clicks):\n${keywordsList || "N/A"}

Article (truncated):\n${textContent}

Return concise, editor-friendly guidance in Markdown with sections:
## Search Characteristic Analysis
## Semantic Hijacking Opportunities
## Core Hijacking Strategy
## Implementation Priority\n`;

    // Step 4: Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Output in Traditional Chinese. Be concise and actionable for editors (non-technical)." },
        { role: "user", content: prompt },
      ],
    });
    const analysis: string = completion.choices[0]?.message?.content || "無法生成分析結果";

    // Step 5: Build sections (light parsing)
    const sections = splitSections(analysis);
    const keywordsAnalyzed = keywordsList ? keywordsList.split(/\n+/).length : 0;

    return NextResponse.json({ success: true, analysis, sections, keywordsAnalyzed }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

function toPlainText(html: string) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function splitSections(md: string) {
  const get = (title: string) => {
    const re = new RegExp(`## ${title}[\\s\\S]*?(?=\n## |$)`, "i");
    const m = md.match(re);
    return m ? m[0] : "";
  };
  return {
    quickWins: get("Search Characteristic Analysis"),
    paragraphAdditions: get("Core Hijacking Strategy"),
    structuralChanges: get("Implementation Priority"),
    rawAnalysis: md,
  };
}
