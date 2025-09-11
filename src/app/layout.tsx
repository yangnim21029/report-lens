import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";


export const metadata: Metadata = {
	title: "RepostLens | SEO Semantic Hijacking",
	description:
		"Transform your SEO strategy with data-driven semantic hijacking",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body>{children}</body>
		</html>
	);
}
