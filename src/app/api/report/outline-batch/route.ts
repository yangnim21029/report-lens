import { NextResponse } from "next/server";
import { getVertexTextModel } from "~/server/vertex/client";

interface BatchItem {
  analysisText: string;
}

interface BatchResult {
  success: boolean;
  outline?: string;
  error?: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "No items provided" }, { status: 400 });
    }

    if (items.length > 10) {
      return NextResponse.json({ success: false, error: "Maximum 10 items per batch" }, { status: 400 });
    }

    // 並行處理所有項目
    const results = await Promise.all(
      items.map(async (item: BatchItem): Promise<BatchResult> => {
        try {
          const analysisText = typeof item.analysisText === "string" ? item.analysisText.trim() : "";
          
          if (!analysisText) {
            return {
              success: false,
              error: "Missing analysisText",
            };
          }

          const prompt = buildOutlinePrompt(analysisText);

          const model = getVertexTextModel();
          const resp = await model.generateContent(prompt);
          const outline =
            resp.response?.candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? "")
              .join("")
              .trim() ?? "";
          
          if (!outline) {
            return {
              success: false,
              error: "Empty outline",
            };
          }

          return {
            success: true,
            outline,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function buildOutlinePrompt(analysisText: string) {
  const sanitized = analysisText.length > 8000 ? analysisText.slice(0, 8000) : analysisText;
  return `${sanitized}\n------\n\n根據上述，給我一個 h2/h3 文章大綱\n\n格式如下：\n\nh2 xxx\nh3 xxx\n----\n以上是 prompt, 不要有任何其他建議，只需要輸出文章大綱, do not include analysis suggest as h tag which is not article but a suggestion. 不要提供 快速導航 h2，已經有了`;
}
