import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { COLORS } from "../theme";

export interface ServerFormValues {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  container?: string;
}

type Field = "name" | "host" | "port" | "user" | "password" | "container";
const ORDER: Field[] = ["name", "host", "port", "user", "password", "container"];
const LABELS: Record<Field, string> = {
  name: "Server name",
  host: "Host",
  port: "Port",
  user: "Username",
  password: "Password",
  container: "Docker container (optional)",
};

export const ServerForm: React.FC<{
  title: string;
  initial?: Partial<ServerFormValues>;
  keepPasswordOption?: boolean;
  status?: { kind: "info" | "err"; text: string } | null;
  onSubmit: (v: ServerFormValues & { keepPassword?: boolean }) => void;
}> = ({ title, initial, keepPasswordOption, status, onSubmit }) => {
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({
    name: initial?.name ?? "",
    host: initial?.host ?? "",
    port: initial?.port != null ? String(initial.port) : "3306",
    user: initial?.user ?? "",
    password: "",
    container: initial?.container ?? "",
  });
  const [keepPassword, setKeepPassword] = useState<boolean>(!!keepPasswordOption);
  const [current, setCurrent] = useState(values[ORDER[0]]);

  const field = ORDER[idx];
  const isPass = field === "password";

  function advance(next: string) {
    const newVals = { ...values, [field]: next };
    setValues(newVals);
    if (idx + 1 >= ORDER.length) {
      const port = parseInt(newVals.port, 10) || 3306;
      const container = newVals.container.trim();
      onSubmit({
        name: newVals.name.trim(),
        host: newVals.host.trim(),
        port,
        user: newVals.user.trim(),
        password: keepPasswordOption && keepPassword ? "" : newVals.password,
        container: container.length > 0 ? container : undefined,
        keepPassword: keepPasswordOption ? keepPassword : undefined,
      });
      return;
    }
    setIdx(idx + 1);
    setCurrent(values[ORDER[idx + 1]] ?? "");
  }

  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {ORDER.slice(0, idx).map((f) => (
          <Text key={f} color={COLORS.chrome}>
            {LABELS[f]}: <Text color={COLORS.text}>{f === "password" ? (keepPassword ? "(kept)" : "•".repeat(values[f].length)) : values[f]}</Text>
          </Text>
        ))}
        <Box>
          <Text color={COLORS.accent}>{LABELS[field]}: </Text>
          {isPass && keepPasswordOption && keepPassword ? (
            <Text color={COLORS.chrome}>(kept — press enter, or type to replace) </Text>
          ) : null}
          <TextInput
            value={current}
            onChange={(v) => {
              setCurrent(v);
              if (isPass && keepPasswordOption && keepPassword && v.length > 0) {
                setKeepPassword(false);
              }
            }}
            onSubmit={(v) => advance(v)}
            mask={isPass ? "•" : undefined}
          />
        </Box>
      </Box>
      {status && (
        <Box marginTop={1}>
          <Text color={status.kind === "err" ? COLORS.err : COLORS.accent}>{status.text}</Text>
        </Box>
      )}
    </Box>
  );
};
