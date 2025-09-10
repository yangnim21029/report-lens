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
        // 1) Derive siteCode from hostname
        const url = new URL(input.pageUrl);
        const host = url.hostname.replace(/^www\./, "");
        const siteMap: Record<string, string> = {
          "pretty.presslogic.com": "GS_HK",
          "girlstyle.com": "GS_TW",
          "holidaysmart.io": "HS_HK",
          "urbanlifehk.com": "UL_HK",
          "poplady-mag.com": "POP_HK",
          "topbeautyhk.com": "TOP_HK",
          "thekdaily.com": "KD_HK",
          "businessfocus.io": "BF_HK",
          "mamidaily.com": "MD_HK",
          "thepetcity.co": "PET_HK",
        };
        const siteCode = siteMap[host];
        if (!siteCode) {
          throw new Error(`Unknown site for host: ${host}`);
        }

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
        // Try common fields for article text
        const article: string =
          data?.content || data?.data?.content || data?.html || data?.text || JSON.stringify(data);

        // 4) Build prompt
        const prompt = `${input.analysisText}\n-----\n\n\n\n因為不能新增新的一篇，幫我找出我應該增加的一段 context vector 內容，覆蓋關鍵字同時，也讓閱讀體驗更好（列出原文的段落類型，以及文章類型，以及該類型前/後/現有內容中，可以置入的一段內容）\n\n\n\n-----\n\n\n\n以下是原文：\n\n${article}`;

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
