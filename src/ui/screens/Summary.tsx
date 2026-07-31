import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { COLORS } from "../theme";

export const Summary: React.FC<{
  kind: "ok" | "err";
  title: string;
  lines: string[];
  onDone: () => void;
}> = ({ kind, title, lines, onDone }) => {
  useInput((_i, key) => {
    if (key.return || key.escape) onDone();
  });
  const color = kind === "ok" ? COLORS.ok : COLORS.err;
  return (
    <Box flexDirection="column">
      <Text color={color} bold>{kind === "ok" ? "✓ " : "✗ "}{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {lines.map((l, i) => (
          <Text key={i} color={COLORS.text}>{l}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={COLORS.chrome}>press enter to continue</Text>
      </Box>
    </Box>
  );
};
