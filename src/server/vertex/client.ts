import { VertexAI } from "@google-cloud/vertexai";

import { env } from "~/env";

let cachedVertex: VertexAI | null = null;

function getVertexClient() {
	const project = env.VERTEXAI_PROJECT || env.GOOGLE_PROJECT_ID;
	const location = env.VERTEXAI_LOCATION || "us-central1";
	const clientEmail = env.GOOGLE_CLIENT_EMAIL;
	const privateKeyRaw = env.GOOGLE_PRIVATE_KEY;

	if (!project || !clientEmail || !privateKeyRaw) {
		throw new Error("Vertex AI credentials are not fully configured");
	}

	const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

	if (!cachedVertex) {
		cachedVertex = new VertexAI({
			project,
			location,
			googleAuthOptions: {
				credentials: {
					client_email: clientEmail,
					private_key: privateKey,
				},
			},
		});
	}

	return cachedVertex;
}

export function getVertexTextModel(modelId?: string) {
	const resolvedModelId = modelId || env.VERTEXAI_TEXT_MODEL || "gemini-2.5-flash";
	return getVertexClient().getGenerativeModel({ model: resolvedModelId });
}
