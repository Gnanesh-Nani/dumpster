import React from "react";
import { Box, Text } from "ink";
import { COLORS, fmtBytes } from "../theme";

export interface ProgressState {
  written: number;
  total: number;
  speedLabel: string;
  etaLabel: string;
  label: string;
}

export const Progress: React.FC<{ state: ProgressState; width?: number }> = ({ state, width = 40 }) => {
  const pct = state.total > 0 ? Math.min(state.written / state.total, 1) : 0;
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>{state.label}</Text>
      <Box marginTop={1}>
        <Text color={COLORS.accent}>{bar}</Text>
        <Text color={COLORS.text} bold> {(pct * 100).toFixed(1)}%</Text>
      </Box>
      <Text color={COLORS.chrome}>
        {fmtBytes(state.written)} / {fmtBytes(state.total)}  ·  {state.speedLabel}  ·  ETA {state.etaLabel}
      </Text>
    </Box>
  );
};
