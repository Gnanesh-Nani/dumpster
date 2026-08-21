import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { COLORS } from "../theme";

export type DumpMethod = "docker-adhoc" | "js";

export const DumpMethodPicker: React.FC<{
  hasDocker: boolean;
  onPick: (m: DumpMethod) => void;
  onCancel: () => void;
}> = ({ hasDocker, onPick, onCancel }) => {
  type V = { kind: "method"; method: DumpMethod } | { kind: "cancel" };
  const items: { key: string; label: string; value: V }[] = [
    ...(hasDocker
      ? [{
          key: "docker",
          label: "Run mysqldump via a disposable Docker container (recommended)",
          value: { kind: "method", method: "docker-adhoc" as const } as V,
        }]
      : []),
    {
      key: "js",
      label: "Use built-in JS dump (no Docker or mysqldump needed)",
      value: { kind: "method", method: "js" as const } as V,
    },
    { key: "cancel", label: "Cancel", value: { kind: "cancel" } as V },
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>mysqldump not found on this machine</Text>
      <Text color={COLORS.chrome}>This local server has no `mysqldump`/`mysql` client tools installed.</Text>
      <Text color={COLORS.chrome}>Choose how dumpster should take the dump:</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => {
            if (i.value.kind === "cancel") onCancel();
            else onPick(i.value.method);
          }}
        />
      </Box>
    </Box>
  );
};
