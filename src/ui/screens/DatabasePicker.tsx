import React, { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { COLORS } from "../theme";

export const Loading: React.FC<{ text: string }> = ({ text }) => (
  <Box>
    <Text color={COLORS.accent}>
      <Spinner type="dots" />
    </Text>
    <Text color={COLORS.chrome}> {text}</Text>
  </Box>
);

export const DatabasePicker: React.FC<{
  title: string;
  databases: string[];
  allowCreate?: boolean;
  onPick: (db: string) => void;
  onCreate?: () => void;
}> = ({ title, databases, allowCreate, onPick, onCreate }) => {
  type V = { kind: "db"; name: string } | { kind: "new" };
  const items: { key: string; label: string; value: V }[] = [
    ...databases.map((d) => ({ key: `db:${d}`, label: d, value: { kind: "db", name: d } as V })),
    ...(allowCreate ? [{ key: "new", label: "+ Create new database", value: { kind: "new" } as V }] : []),
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>{title}</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => {
            if (i.value.kind === "new") onCreate?.();
            else onPick(i.value.name);
          }}
        />
      </Box>
    </Box>
  );
};

export const NewDatabaseName: React.FC<{
  onSubmit: (name: string) => void;
}> = ({ onSubmit }) => {
  const [v, setV] = useState("");
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>New database name</Text>
      <Box marginTop={1}>
        <Text color={COLORS.accent}>name: </Text>
        <TextInput value={v} onChange={setV} onSubmit={(x) => x.trim() && onSubmit(x.trim())} />
      </Box>
    </Box>
  );
};

export const OutputPathInput: React.FC<{
  defaultPath: string;
  onSubmit: (p: string) => void;
}> = ({ defaultPath, onSubmit }) => {
  const [v, setV] = useState(defaultPath);
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>Output file path</Text>
      <Box marginTop={1}>
        <Text color={COLORS.accent}>path: </Text>
        <TextInput value={v} onChange={setV} onSubmit={(x) => x.trim() && onSubmit(x.trim())} />
      </Box>
    </Box>
  );
};
