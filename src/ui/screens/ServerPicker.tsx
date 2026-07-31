import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { COLORS } from "../theme";
import { ServerProfile } from "../../config/types";

export const ServerPicker: React.FC<{
  servers: ServerProfile[];
  label: string;
  onPick: (s: ServerProfile) => void;
  onNew: () => void;
}> = ({ servers, label, onPick, onNew }) => {
  type V = { kind: "server"; id: string } | { kind: "new" };
  const items: { key: string; label: string; value: V }[] = [
    ...servers.map((s) => ({
      key: `s:${s.id}`,
      label: `${s.name}  (${s.host}:${s.port})`,
      value: { kind: "server", id: s.id } as V,
    })),
    { key: "new", label: "+ Add new MySQL server", value: { kind: "new" } as V },
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>Select {label} server</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => {
            const v = i.value;
            if (v.kind === "new") onNew();
            else onPick(servers.find((s) => s.id === v.id)!);
          }}
        />
      </Box>
    </Box>
  );
};
