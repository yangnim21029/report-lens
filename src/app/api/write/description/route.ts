import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const analyseResult = body?.analysisText || body?.analysis || body?.analyseResult || '';
    const outline = body?.outlineText || body?.outline || '';
    
    if (!analyseResult || !outline) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Missing required fields: analysisText and outlineText are required" 
        }, 
        { status: 400 }
      );
    }

    // 使用你的原始 prompt template
    const descriptionPrompt = `${analyseResult}----
把大綱中的每一段h2h3要寫什麼，用一段話說明在[...]內，需要能幫我排名 SEO

${outline}

output format:
h2 xxx
h3 xxx
[...]
h3 xxx
[...]
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        {
          role: "user",
          content: descriptionPrompt,
        },
      ],
    });

    const generatedContent = completion.choices[0]?.message?.content?.trim() || "";
    
    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: "Failed to generate content description" }, 
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      content: generatedContent,
      description: generatedContent,
    });

  } catch (error) {
    console.error('[write/description] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unexpected error" 
      }, 
      { status: 500 }
    );
  }
}
