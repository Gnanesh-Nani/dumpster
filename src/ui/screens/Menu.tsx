import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { COLORS } from "../theme";

export type MenuAction = "remote-sources" | "dump-local" | "dump-file" | "credits";

export const Menu: React.FC<{ onSelect: (a: MenuAction) => void }> = ({ onSelect }) => {
  const items = [
    { label: "Dump to local database (clone)", value: "dump-local" as const },
    { label: "Dump to a .sql file", value: "dump-file" as const },
    { label: "Manage remote sources", value: "remote-sources" as const },
    { label: "Credits", value: "credits" as const },
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>What do you want to do?</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(i) => onSelect(i.value)} />
      </Box>
    </Box>
  );
};
