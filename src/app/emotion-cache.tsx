"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState } from "react";

export function EmotionCacheProvider({
	children,
}: { children: React.ReactNode }) {
	const [cache] = useState(() => {
		const cache = createCache({ key: "chakra" });
		cache.compat = true;
		return cache;
	});

	useServerInsertedHTML(() => {
		// Emotion doesn't properly support streaming SSR yet
		return null;
	});

	return <CacheProvider value={cache}>{children}</CacheProvider>;
}
