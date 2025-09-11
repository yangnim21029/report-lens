import { OpenAI } from "openai";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const reportRouter = createTRPCRouter({
  generateEmail: publicProcedure
    .input(
      z.object({
        analysisText: z.string(),
        pageData: z.object({
          page: z.string(),
          best_query: z.string(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini-2025-08-07",
          messages: [
            {
              role: "system",
              content:
                "你是資深內容營運與商務開發編輯，請用繁體中文，輸出一封精煉、可直接寄出的 Email 摘要，包含關鍵機會、3-5 個最優先行動與預期效益。",
            },
            {
              role: "user",
              content: `請依據以下分析結果，撰寫給內容團隊的 Email：\n\n[分析結果]\n${input.analysisText}\n\n[頁面資訊]\nURL: ${input.pageData.page}\nBest query: ${input.pageData.best_query}`,
            },
          ],
        });
        const emailContent = completion.choices[0]?.message?.content ?? "";
        return { success: true as const, emailContent };
      } catch (error) {
        console.error("report.generateEmail error:", error);
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Failed to generate email",
          emailContent: "",
        };
      }
    }),

  // Combine analyze result + original article (via page-lens proxy) into prompt for context vector
  generateContextVector: publicProcedure
    .input(
      z.object({
        analysisText: z.string(),
        pageUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // 1) Derive siteCode based on hostname rules
        const url = new URL(input.pageUrl);
        const host = url.hostname.replace(/^www\./, "");
        const path = url.pathname.toLowerCase();

        // Fixed mapping by host (no path-based region)
        const fixedByHost: Record<string, string> = {
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
        if (host === "holidaysmart.io") {
          // Holidaysmart: derive HK/TW from path explicitly
          siteCode = path.includes("/tw/") ? "HS_TW" : "HS_HK";
        } else if (fixedByHost[host]) {
          siteCode = fixedByHost[host];
        }

        if (!siteCode) throw new Error(`Unknown or unsupported site for host: ${host}`);

        // 2) Extract resourceId from URL path: look for /article/{id}/
        const idMatch = url.pathname.match(/\/article\/(\d+)/i);
        const resourceId = idMatch?.[1];
        if (!resourceId) {
          throw new Error(`Cannot parse resourceId from path: ${url.pathname}`);
        }

        // 3) Fetch article content from page-lens proxy
        const proxyUrl = "https://page-lens-zeta.vercel.app/api/proxy/content";
        const res = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId, siteCode }),
        });
        if (!res.ok) {
          throw new Error(`Proxy fetch failed: ${res.status}`);
        }
        const data = await res.json().catch(() => ({} as any));
        // Log response shape for inspection
        try {
          console.log("[report] proxy.content response summary:", {
            siteCode,
            resourceId,
            keys: Object.keys(data ?? {}),
            has: {
              content: typeof data?.content === "string",
              dataContent: typeof data?.data?.content === "string",
              html: typeof data?.html === "string",
              text: typeof data?.text === "string",
            },
            lengths: {
              content: typeof data?.content === "string" ? data.content.length : undefined,
              dataContent:
                typeof data?.data?.content === "string" ? data.data.content.length : undefined,
              html: typeof data?.html === "string" ? data.html.length : undefined,
              text: typeof data?.text === "string" ? data.text.length : undefined,
            },
            sample: (data?.content || data?.data?.content || data?.html || data?.text || "").slice(0, 200),
          });
        } catch {}
        // Extract article HTML/text from common shapes
        const article: string =
          (typeof data?.content?.data?.post_content === "string"
            ? data.content.data.post_content
            : undefined) ||
          (typeof data?.data?.content === "string" ? data.data.content : undefined) ||
          (typeof data?.content === "string" ? data.content : undefined) ||
          (typeof data?.html === "string" ? data.html : undefined) ||
          (typeof data?.text === "string" ? data.text : undefined) ||
          JSON.stringify(data);

        // 4) Build prompt
        const prompt = `你是一位專業的 SEO 內容策略師與文案寫手。你的專長是分析使用者意圖與搜尋引擎策略，以創造出精準、簡潔且高影響力的內容。你的任務不僅是撰寫文字，更是要設計一個能夠「劫持」目標搜尋流量、並與現有文章無縫整合的內容解決方案。

Task

${input.analysisText}

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


\n-----\n\n\n\n任務：示範2~3優化，因為不能新增新的一篇文章，但我又想包含更多關鍵字，請幫我示範增加 context vector 的段落內容，覆蓋關鍵字同時，也讓閱讀體驗更好（列出原文的段落類型，以及文章類型，以及該類型前/後/現有內容中，可以置入的一段內容）\n\n\n\n-----\n\n\n\n以下是原文：\n\n${article}`;

        // 5) Ask OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini-2025-08-07",
          messages: [
            {
              role: "system",
              content:
                "你是資深內容編輯與 SEO 策略顧問，輸出使用繁體中文，提供可直接置入原文的一段 context vector 建議，清楚標註放置位置與理由。",
            },
            { role: "user", content: prompt },
          ],
        });

        const content = completion.choices[0]?.message?.content ?? "";

        // for dev: show generated suggestion summary (first 200 chars)
        try { console.log("[report] generated context vector (preview)", content.slice(0, 20000)); } catch {}

        return { success: true as const, content };
      } catch (error) {
        console.error("report.generateContextVector error:", error);
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Generation failed",
          content: "",
        };
      }
    }),

  generateCsv: publicProcedure
    .input(
      z.object({
        analysisText: z.string(),
        pageData: z.object({
          page: z.string(),
          best_query: z.string(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Minimal CSV: include url, best_query, and the raw analysis as one field
        const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
        const header = "url,best_query,analysis";
        const line = [input.pageData.page, input.pageData.best_query, input.analysisText]
          .map((v) => esc(String(v ?? "")))
          .join(",");
        const csvContent = header + "\n" + line;
        return { success: true as const, csvContent };
      } catch (error) {
        console.error("report.generateCsv error:", error);
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Failed to generate CSV",
          csvContent: "",
        };
      }
    }),
});
