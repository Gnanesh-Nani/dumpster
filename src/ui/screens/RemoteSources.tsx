import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { COLORS } from "../theme";
import { ServerProfile } from "../../config/types";

export const RemoteSources: React.FC<{
  servers: ServerProfile[];
  onPickServer: (s: ServerProfile) => void;
  onNew: () => void;
  onRemovePicker: () => void;
}> = ({ servers, onPickServer, onNew, onRemovePicker }) => {
  type V = { kind: "s"; id: string } | { kind: "new" } | { kind: "remove" };
  const items: { key: string; label: string; value: V }[] = [
    ...servers.map((s) => ({
      key: `s:${s.id}`,
      label: `${s.name}  (${s.host}:${s.port})`,
      value: { kind: "s", id: s.id } as V,
    })),
    { key: "new", label: "+ Add new MySQL server", value: { kind: "new" } as V },
    ...(servers.length > 0
      ? [{ key: "remove", label: "− Remove a remote source", value: { kind: "remove" } as V }]
      : []),
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>Remote sources</Text>
      {servers.length === 0 && (
        <Box marginTop={1}>
          <Text color={COLORS.chrome}>No servers yet. Add one to get started.</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => {
            const v = i.value;
            if (v.kind === "new") onNew();
            else if (v.kind === "remove") onRemovePicker();
            else onPickServer(servers.find((s) => s.id === v.id)!);
          }}
        />
      </Box>
    </Box>
  );
};

export const RemovePicker: React.FC<{
  servers: ServerProfile[];
  onPick: (s: ServerProfile) => void;
}> = ({ servers, onPick }) => {
  const items = servers.map((s) => ({
    key: s.id,
    label: `${s.name}  (${s.host}:${s.port})`,
    value: s.id,
  }));
  return (
    <Box flexDirection="column">
      <Text color={COLORS.err} bold>Remove which remote source?</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => onPick(servers.find((s) => s.id === i.value)!)}
        />
      </Box>
    </Box>
  );
};

export const ServerActions: React.FC<{
  server: ServerProfile;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ server, onEdit, onRemove }) => {
  const items = [
    { label: "Edit", value: "edit" as const },
    { label: "Remove", value: "remove" as const },
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>{server.name}</Text>
      <Text color={COLORS.chrome}>{server.host}:{server.port} · {server.user}</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(i) => (i.value === "edit" ? onEdit() : onRemove())}
        />
      </Box>
    </Box>
  );
};

export const ConfirmRemove: React.FC<{
  server: ServerProfile;
  onAnswer: (ok: boolean) => void;
}> = ({ server, onAnswer }) => {
  const items = [
    { label: "No, keep it", value: false },
    { label: `Yes, remove ${server.name}`, value: true },
  ];
  return (
    <Box flexDirection="column">
      <Text color={COLORS.err} bold>Remove '{server.name}'?</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(i) => onAnswer(i.value)} />
      </Box>
    </Box>
  );
};
