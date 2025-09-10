import { OpenAI } from "openai";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { extractAnalysisData, formatAsCSV, formatAsEmailWithAI } from "~/utils/analysisExtractor";

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
        const extracted = extractAnalysisData(input.analysisText, input.pageData);
        const emailContent = await formatAsEmailWithAI(extracted, input.analysisText, openai);
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
        const extracted = extractAnalysisData(input.analysisText, input.pageData);
        const csvContent = formatAsCSV(extracted);
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

