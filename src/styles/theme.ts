// @ts-nocheck
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const customConfig = defineConfig({
	theme: {
		tokens: {
			colors: {
				ink: { value: "#0a0a0a" },
				paper: { value: "#fafaf9" },
				accent: {
					primary: { value: "#ff0055" },
					secondary: { value: "#00ff88" },
					tertiary: { value: "#ffaa00" },
					info: { value: "#00aaff" },
				},
				gray: {
					1: { value: "#1a1a1a" },
					2: { value: "#2a2a2a" },
					3: { value: "#3a3a3a" },
					4: { value: "#6a6a6a" },
					5: { value: "#9a9a9a" },
					6: { value: "#cacaca" },
					7: { value: "#eaeaea" },
					8: { value: "#f5f5f5" },
				},
			},
			fonts: {
				heading: { value: "var(--font-geist-sans), -apple-system, sans-serif" },
				body: { value: "var(--font-geist-sans), -apple-system, sans-serif" },
				mono: { value: "Menlo, Monaco, Consolas, monospace" },
			},
			fontSizes: {
				xs: { value: "clamp(0.75rem, 1.5vw, 0.875rem)" },
				sm: { value: "clamp(0.875rem, 2vw, 1rem)" },
				md: { value: "clamp(1rem, 2.5vw, 1.125rem)" },
				lg: { value: "clamp(1.25rem, 3vw, 1.5rem)" },
				xl: { value: "clamp(1.875rem, 4vw, 2.25rem)" },
				"2xl": { value: "clamp(2.5rem, 6vw, 3.75rem)" },
				"3xl": { value: "clamp(3.75rem, 8vw, 6rem)" },
				display: { value: "clamp(4rem, 12vw, 10rem)" },
			},
			animations: {
				tension: { value: "cubic-bezier(0.7, 0, 0.3, 1)" },
				smooth: { value: "cubic-bezier(0.4, 0, 0.2, 1)" },
				bounce: { value: "cubic-bezier(0.68, -0.55, 0.265, 1.55)" },
			},
			durations: {
				instant: { value: "100ms" },
				fast: { value: "200ms" },
				normal: { value: "400ms" },
				slow: { value: "800ms" },
			},
			radii: {
				none: { value: "0" },
				brutal: { value: "0" },
				sm: { value: "2px" },
				md: { value: "4px" },
			},
			shadows: {
				brutal: { value: "4px 4px 0 var(--colors-accent-primary)" },
				brutalHover: { value: "6px 6px 0 var(--colors-accent-primary)" },
				paper: {
					value: "0 1px 2px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.07)",
				},
			},
		},
		semanticTokens: {
			colors: {
				background: { value: "{colors.paper}" },
				foreground: { value: "{colors.ink}" },
				primary: { value: "{colors.accent.primary}" },
				secondary: { value: "{colors.accent.secondary}" },
				muted: { value: "{colors.gray.5}" },
				border: { value: "{colors.gray.7}" },
			},
		},
		recipes: {
			// Custom Button Recipe - Brutalist Style
			button: {
				base: {
					fontWeight: "700",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					transition: "all 200ms cubic-bezier(0.7, 0, 0.3, 1)",
					cursor: "pointer",
					position: "relative",
					border: "3px solid",
					_hover: {
						transform: "translate(-2px, -2px)",
					},
					_active: {
						transform: "translate(0, 0)",
					},
				},
				variants: {
					variant: {
						brutal: {
							bg: "ink",
							color: "paper",
							borderColor: "ink",
							_hover: {
								boxShadow: "brutal",
							},
							_active: {
								boxShadow: "none",
							},
						},
						ghost: {
							bg: "transparent",
							color: "ink",
							borderColor: "transparent",
							_hover: {
								color: "primary",
								borderColor: "primary",
							},
						},
						outline: {
							bg: "transparent",
							color: "ink",
							borderColor: "ink",
							_hover: {
								bg: "ink",
								color: "paper",
							},
						},
					},
					size: {
						sm: {
							px: "4",
							py: "2",
							fontSize: "sm",
						},
						md: {
							px: "6",
							py: "3",
							fontSize: "md",
						},
						lg: {
							px: "8",
							py: "4",
							fontSize: "lg",
						},
					},
				},
				// defaultVariants removed due to Chakra v3 recipe typings
			},
			// Custom Card Recipe
			card: {
				base: {
					position: "relative",
					bg: "gray.8",
					border: "1px solid",
					borderColor: "gray.7",
					transition: "all 400ms cubic-bezier(0.7, 0, 0.3, 1)",
					_hover: {
						transform: "translateY(-2px)",
						borderColor: "primary",
					},
				},
			},
			// Custom Input Recipe
			input: {
				base: {
					field: {
						bg: "transparent",
						borderBottom: "3px solid",
						borderColor: "gray.6",
						borderRadius: "0",
						fontSize: "xl",
						fontWeight: "bold",
						color: "ink",
						_placeholder: {
							color: "gray.5",
						},
						_focus: {
							borderColor: "primary",
							outline: "none",
						},
					},
				},
			},
		},
	},
	globalCss: {
		"html, body": {
			bg: "background",
			color: "foreground",
			minHeight: "100vh",
		},
		"::selection": {
			bg: "primary",
			color: "paper",
		},
		":focus-visible": {
			outline: "2px solid",
			outlineColor: "primary",
			outlineOffset: "4px",
		},
	},
});

export const system = createSystem(defaultConfig, customConfig);
