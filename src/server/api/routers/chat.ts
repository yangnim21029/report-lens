import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	extractAnalysisData,
	formatForGoogleChat,
} from "~/utils/extract-format-html";

export const chatRouter = createTRPCRouter({
	sendAnalysisToChat: publicProcedure
		.input(
			z.object({
				analysis: z.string(),
				pageData: z.object({
					page: z.string(),
					best_query: z.string(),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				// Check if webhook URL is configured
				if (!env.GOOGLE_CHAT_WEBHOOK_URL) {
					return {
						success: false,
						error: "Google Chat webhook URL not configured",
					};
				}

				// Extract structured data from analysis
				const extractedData = extractAnalysisData(
					input.analysis,
					input.pageData,
				);

				// Format message for Google Chat
				const messageText = formatForGoogleChat(extractedData);

				// Send to Google Chat
				const response = await fetch(env.GOOGLE_CHAT_WEBHOOK_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						text: messageText,
					}),
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error("Google Chat API error:", errorText);
					return {
						success: false,
						error: `Failed to send to Google Chat: ${response.status}`,
					};
				}

				return {
					success: true,
					message: "Analysis sent to Google Chat successfully",
				};
			} catch (error) {
				console.error("Error sending to Google Chat:", error);
				return {
					success: false,
					error:
						error instanceof Error ? error.message : "Unknown error occurred",
				};
			}
		}),

	// Helper endpoint to test webhook configuration
	testWebhook: publicProcedure.query(async () => {
		if (!env.GOOGLE_CHAT_WEBHOOK_URL) {
			return {
				configured: false,
				message:
					"Google Chat webhook URL not configured in environment variables",
			};
		}

		try {
			const testMessage = {
				text:
					"🔔 RepostLens Test Message\n\nGoogle Chat integration is working correctly!\n\n" +
					`Timestamp: ${new Date().toLocaleString("zh-TW", {
						timeZone: "Asia/Taipei",
					})}`,
			};

			const response = await fetch(env.GOOGLE_CHAT_WEBHOOK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(testMessage),
			});

			if (response.ok) {
				return {
					configured: true,
					message: "Webhook configured and working",
				};
			} else {
				return {
					configured: true,
					message: `Webhook configured but returned error: ${response.status}`,
				};
			}
		} catch (error) {
			return {
				configured: true,
				message: `Webhook configured but error occurred: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			};
		}
	}),
});
