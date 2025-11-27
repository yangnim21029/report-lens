import { NextResponse } from "next/server";
import { getVertexTextModel } from "~/server/vertex/client";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const analyzeResult: unknown = body?.analyzeResult ?? body?.analysis ?? body?.content ?? "";
    const analysisText = typeof analyzeResult === "string" ? analyzeResult.trim() : "";
    if (!analysisText) {
      return NextResponse.json({ success: false, error: "Missing analyzeResult" }, { status: 400 });
    }

    const prompt = buildOutlinePrompt(analysisText);

    const model = getVertexTextModel();
    const response = await model.generateContent(prompt);
    const vertexResponse = await response.response;
    const outline =
      vertexResponse.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
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
  return `${sanitized}\n------\n\n根據上述，給我一個 h2/h3 文章大綱\n\n格式如下：\n\nh2 xxx\nh3 xxx\n----\n以上是 prompt, 不要有任何其他建議，只需要輸出文章大綱, do not include analysis suggest as h tag which is not article but a suggestion. 不要提供 快速導航 h2，已經有了`;
}
