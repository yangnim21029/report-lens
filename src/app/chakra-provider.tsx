"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { system } from "~/styles/theme";

// 只在需要 Chakra UI 組件的地方使用這個 Provider
export function ChakraWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      {children}
    </ChakraProvider>
  );
}