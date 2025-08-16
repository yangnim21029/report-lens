import { ColorModeScript } from "@chakra-ui/react";
import { system } from "~/styles/theme";

export function ChakraColorModeScript() {
  return <ColorModeScript initialColorMode={system.config?.initialColorMode} />;
}