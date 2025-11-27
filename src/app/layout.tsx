import "~/styles/globals.css";

import type { Metadata } from "next";


export const metadata: Metadata = {
	title: "RepostLens | SEO Semantic Hijacking",
	description:
		"Transform your SEO strategy with data-driven semantic hijacking",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
