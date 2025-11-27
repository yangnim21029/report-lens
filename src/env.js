import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		AUTH_SECRET: z.string().optional(),
		AUTH_DISCORD_ID: z.string().optional(),
		AUTH_DISCORD_SECRET: z.string().optional(),
		DATABASE_URL: z.string().url().optional(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		OPENAI_API_KEY: z.string().optional(),
		GOOGLE_CHAT_WEBHOOK_URL: z.string().url().optional(),
		GSC_DB_ENDPOINT: z.string().url(),
		GOOGLE_PROJECT_ID: z.string().optional(),
		GOOGLE_CLIENT_EMAIL: z.string().optional(),
		GOOGLE_PRIVATE_KEY: z.string().optional(),
		VERTEXAI_PROJECT: z.string().optional(),
		VERTEXAI_LOCATION: z.string().optional(),
		VERTEXAI_TEXT_MODEL: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		AUTH_SECRET: process.env.AUTH_SECRET,
		AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
		AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		GOOGLE_CHAT_WEBHOOK_URL: process.env.GOOGLE_CHAT_WEBHOOK_URL,
		GSC_DB_ENDPOINT: process.env.GSC_DB_ENDPOINT,
		GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
		GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
		GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
		VERTEXAI_PROJECT: process.env.VERTEXAI_PROJECT,
		VERTEXAI_LOCATION: process.env.VERTEXAI_LOCATION,
		VERTEXAI_TEXT_MODEL: process.env.VERTEXAI_TEXT_MODEL,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
