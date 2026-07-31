import React from "react";
import { Box, Text, useInput } from "ink";
import { COLORS } from "../theme";

export const Credits: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useInput((_i, key) => {
    if (key.return || key.escape) onDone();
  });
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>Credits</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.text}>dumpster — MySQL project · server · database cloner</Text>
        <Box marginTop={1}>
          <Text color={COLORS.chrome}>Built by </Text>
          <Text color={COLORS.text} bold>Gnanesh Nani</Text>
        </Box>
        <Text color={COLORS.chrome}>
          GitHub: <Text color={COLORS.accent}>https://github.com/Gnanesh-Nani</Text>
        </Text>
        <Box marginTop={1}>
          <Text color={COLORS.chrome}>Thanks for using dumpster. PRs + stars welcome.</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={COLORS.chrome}>press enter to go back</Text>
      </Box>
    </Box>
  );
};
