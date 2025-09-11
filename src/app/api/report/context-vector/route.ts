import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { env } from "~/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Direct implementation of context vector generation (remove tRPC dependency)
export async function POST(req: Request) {
  try {
    const { analysisText, pageUrl } = await req.json();
    if (!pageUrl) return NextResponse.json({ success: false, error: "Missing pageUrl" }, { status: 400 });

    const { siteCode, resourceId } = deriveSiteCodeAndId(pageUrl);
    // Fetch original content from page-lens proxy
    const res = await fetch("https://page-lens-zeta.vercel.app/api/proxy/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, siteCode }),
    });
    if (!res.ok) return NextResponse.json({ success: false, error: `Proxy fetch failed: ${res.status}` }, { status: 502 });
    const data = await res.json().catch(() => ({} as any));

    const article: string =
      (typeof data?.content?.data?.post_content === "string" ? data.content.data.post_content : undefined) ||
      (typeof data?.data?.post_content === "string" ? data.data.post_content : undefined) ||
      (typeof data?.data?.content === "string" ? data.data.content : undefined) ||
      (typeof data?.content === "string" ? data.content : undefined) ||
      (typeof data?.html === "string" ? data.html : undefined) ||
      (typeof data?.text === "string" ? data.text : undefined) ||
      "";

    const prompt = buildContextVectorPrompt(String(analysisText || ""), toPlainText(article).slice(0, 8000));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "你是資深內容編輯與 SEO 策略顧問，輸出使用繁體中文，提供可直接置入原文的一段 context vector 建議，清楚標註放置位置與理由。" },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ success: true, content }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

function deriveSiteCodeAndId(pageUrl: string) {
  const u = new URL(pageUrl);
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.toLowerCase();
  const fixed: Record<string, string> = {
    "pretty.presslogic.com": "GS_HK",
    "girlstyle.com": "GS_TW",
    "urbanlifehk.com": "UL_HK",
    "poplady-mag.com": "POP_HK",
    "topbeautyhk.com": "TOP_HK",
    "thekdaily.com": "KD_HK",
    "businessfocus.io": "BF_HK",
    "mamidaily.com": "MD_HK",
    "thepetcity.co": "PET_HK",
  };
  let siteCode: string | undefined;
  if (host === "holidaysmart.io") siteCode = path.includes("/tw/") ? "HS_TW" : "HS_HK";
  else siteCode = fixed[host];
  if (!siteCode) throw new Error(`Unknown site: ${host}`);
  const m = u.pathname.match(/\/article\/(\d+)/i);
  const resourceId = m?.[1] || "";
  if (!resourceId) throw new Error(`Cannot parse resourceId from path: ${u.pathname}`);
  return { siteCode, resourceId };
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

function buildContextVectorPrompt(analysisText: string, articleText: string) {
  return `你是一位專業的 SEO 內容策略師與文案寫手。你的專長是分析使用者意圖與搜尋引擎策略，以創造出精準、簡潔且高影響力的內容。你的任務不僅是撰寫文字，更是要設計一個能夠「劫持」目標搜尋流量、並與現有文章無縫整合的內容解決方案。

Task

${analysisText || "分析結果：N/A"}

（AI 參考上述分析，執行以下任務）

你的核心任務是為一個 [請填寫主題/對象，例如：產品、人物、概念] 撰寫一個全面而簡潔的 [請填寫內容區塊名稱，例如：快速檔案、核心摘要]。這個段落必須能立即且權威地回答使用者最核心的問題 [請填寫核心問題，例如：「[主題]是什麼？」]，並在文章開頭幾句話內就發揮最大的 SEO 效益。最終成品需具備資訊密度高、語氣溫暖在地化、且能無縫嵌入現有文章的特點。

To Do
策略分析：
剖析使用者請求，識別出最根本的目標。
進行 SEO 分析，理解目標受眾的搜尋意圖與現有成功範例的策略。
確定內容需要「預先回答」的核心問題：[此處代入上述核心問題]。

框架建立：
將 SEO 分析結果轉化為具體的內容標準與檢核清單。
建立一個結構化模板，包含：段落類型、修改位置、建議內容（新增與調整）。
整合所有必要的關鍵資料點：[請列出所有必須包含的關鍵資料點，用逗號分隔]。

內容撰寫：
撰寫初稿，確保文字簡潔、吸引人，並整合所有關鍵資料點。
採用 [請填寫期望的語氣，例如：溫暖在地化、專業權威] 的語氣。
運用「SEO 劫持」策略，將最重要的關鍵字與核心資訊放在段落的最前端。

優化修飾：
根據回饋進行精修，確保內容全面而簡潔。
重新檢視開頭的幾句話，最大化其關聯性與影響力。
確保最終段落能與現有文章無縫整合，提升整體閱讀體驗。

Not to Do
避免冗長： 不要寫成一篇完整的說明文，專注於一個精簡的段落。
避免模糊： 不要使用模糊或空泛的描述，必須提供具體、有價值的資訊。
避免資訊後置： 不要將最重要的核心資訊埋在段落深處。
避免語氣不符： 不要使用與指示不符的語氣。
避免內容脫節： 產出的段落不能感覺像外來物，必須與文章的其餘部分風格一致。

-----

任務：示範2~3優化，因為不能新增新的一篇文章，但我又想包含更多關鍵字，請幫我示範增加 context vector 的段落內容，覆蓋關鍵字同時，也讓閱讀體驗更好（列出原文的段落類型，以及文章類型，以及該類型前/後/現有內容中，可以置入的一段內容）

-----

以下是原文：
${articleText}`;
}
