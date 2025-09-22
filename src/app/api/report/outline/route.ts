import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const analyzeResult: unknown = body?.analyzeResult ?? body?.analysis ?? body?.content ?? "";
    const analysisText = typeof analyzeResult === "string" ? analyzeResult.trim() : "";
    if (!analysisText) {
      return NextResponse.json({ success: false, error: "Missing analyzeResult" }, { status: 400 });
    }

    const prompt = buildOutlinePrompt(analysisText);

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        {
          role: "system",
          content:
            "你是資深內容規劃顧問，擅長將分析報告整理成清晰的文章建議大綱，輸出請使用與 user prompt 相同的語言。",
        },
        { role: "user", content: prompt },
      ],
    });

    const outline = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!outline) {
      return NextResponse.json({ success: false, error: "Empty outline" }, { status: 502 });
    }

    return NextResponse.json({ success: true, outline }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function buildOutlinePrompt(analysisText: string) {
  const sanitized = analysisText.length > 8000 ? analysisText.slice(0, 8000) : analysisText;
  return `${sanitized}\n------\n\n根據上述，給我一個 h2/h3 文章大綱\n\n格式如下：\n\nh2 xxx\nh3 xxx\n----\n以上是 prompt, 不要有任何其他建議，只需要輸出文章大綱`;
}
