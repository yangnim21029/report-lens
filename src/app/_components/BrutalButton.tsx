"use client";

import { type ButtonProps, Button as ChakraButton } from "@chakra-ui/react";
import { type HTMLMotionProps, motion } from "framer-motion";

// Merge Chakra Button props with Framer Motion props
type BrutalButtonProps = ButtonProps &
	HTMLMotionProps<"button"> & {
		variant?: "brutal" | "ghost" | "outline";
	};

// Create Motion Button component
const MotionButton = motion(ChakraButton);

export function BrutalButton({
	children,
	variant = "brutal",
	...props
}: BrutalButtonProps) {
	return (
		<MotionButton
			variant={variant}
			whileHover={{ scale: 1.02 }}
			whileTap={{ scale: 0.98 }}
			transition={{
				type: "spring",
				stiffness: 400,
				damping: 17,
			}}
			{...props}
		>
			{children}
		</MotionButton>
	);
}
