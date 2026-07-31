import React from "react";
import { Box, Text } from "ink";
import figlet from "figlet";
import gradient from "gradient-string";
import { COLORS } from "./theme";

const neon = gradient(["#00f5ff", "#ff00e6"]);
const BANNER = neon.multiline(figlet.textSync("DUMPSTER", { font: "ANSI Shadow" }));

export interface Crumb {
  label: string;
  value: string;
}

export const Frame: React.FC<{
  crumbs: Crumb[];
  hint?: string;
  children: React.ReactNode;
}> = ({ crumbs, hint, children }) => {
  return (
    <Box flexDirection="column" width="100%">
      <Box borderStyle="round" borderColor={COLORS.chrome} paddingX={1} flexDirection="column">
        <Text>{BANNER}</Text>
        <Text color={COLORS.chrome}>  MySQL project · server · database cloner</Text>
        {crumbs.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {crumbs.map((c) => (
              <Text key={c.label}>
                <Text color={COLORS.accent} bold>
                  {c.label}:{" "}
                </Text>
                <Text color={COLORS.text}>{c.value}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>

      <Box borderStyle="round" borderColor={COLORS.chrome} paddingX={1} paddingY={0} flexDirection="column" marginTop={0}>
        {children}
      </Box>

      <Box paddingX={1}>
        <Text color={COLORS.chrome}>{hint ?? "↑↓ move · enter select · esc back · ctrl+c quit"}</Text>
      </Box>
    </Box>
  );
};
