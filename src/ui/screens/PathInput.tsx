import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { COLORS } from "../theme";

function expand(p: string): string {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

// Split a partial path into (dir to scan, prefix to match within it).
function splitDirPrefix(input: string): { dir: string; prefix: string } {
  const expanded = expand(input);
  if (expanded.length === 0) return { dir: process.cwd(), prefix: "" };
  if (expanded.endsWith(path.sep)) return { dir: expanded, prefix: "" };
  return { dir: path.dirname(expanded) || ".", prefix: path.basename(expanded) };
}

function longestCommonPrefix(names: string[]): string {
  if (names.length === 0) return "";
  let lcp = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < lcp.length && i < n.length && lcp[i] === n[i]) i++;
    lcp = lcp.slice(0, i);
    if (!lcp) break;
  }
  return lcp;
}

function listMatches(input: string): { dir: string; matches: string[] } {
  const { dir, prefix } = splitDirPrefix(input);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const matches = entries
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => e.name + (e.isDirectory() ? path.sep : ""))
      .sort();
    return { dir, matches };
  } catch {
    return { dir, matches: [] };
  }
}

// Replace only the trailing basename portion of `input` with `newBase`,
// preserving whatever leading path the user typed (including "~").
function replaceBase(input: string, newBase: string): string {
  if (input.length === 0) return newBase;
  if (input.endsWith(path.sep)) return input + newBase;
  const idx = input.lastIndexOf(path.sep);
  if (idx < 0) return newBase;
  return input.slice(0, idx + 1) + newBase;
}

export const PathInput: React.FC<{
  title: string;
  defaultPath: string;
  onSubmit: (p: string) => void;
}> = ({ title, defaultPath, onSubmit }) => {
  const [value, setValue] = useState(defaultPath);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [note, setNote] = useState<string>("");

  useInput((input, key) => {
    if (key.return) {
      const v = expand(value).trim();
      if (v.length > 0) onSubmit(v);
      return;
    }
    if (key.tab) {
      const { matches } = listMatches(value);
      if (matches.length === 0) {
        setSuggestions([]);
        setNote("no matches");
        return;
      }
      const lcp = longestCommonPrefix(matches);
      const trimmedLcp = lcp.endsWith(path.sep) ? lcp.slice(0, -1) : lcp;
      const next = replaceBase(value, trimmedLcp);
      // Preserve the trailing separator when the single match is a directory.
      const finalVal = matches.length === 1 && lcp.endsWith(path.sep) ? next + path.sep : next;
      setValue(finalVal);
      setSuggestions(matches.length > 1 ? matches : []);
      setNote(matches.length > 1 ? `${matches.length} matches` : "");
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setSuggestions([]);
      setNote("");
      return;
    }
    if (key.ctrl && input === "u") {
      setValue("");
      setSuggestions([]);
      setNote("");
      return;
    }
    // Ignore other control keys (arrows, escape handled at App level, etc.)
    if (key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.meta) return;
    if (input && !key.ctrl) {
      setValue((v) => v + input);
      setSuggestions([]);
      setNote("");
    }
  });

  return (
    <Box flexDirection="column">
      <Text color={COLORS.accent} bold>{title}</Text>
      <Box marginTop={1}>
        <Text color={COLORS.accent}>path: </Text>
        <Text color={COLORS.text}>{value}</Text>
        <Text color={COLORS.accent}>▎</Text>
      </Box>
      <Text color={COLORS.chrome}>tab autocomplete · ctrl+u clear · enter confirm</Text>
      {note.length > 0 && <Text color={COLORS.chrome}>{note}</Text>}
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {suggestions.slice(0, 10).map((s) => (
            <Text key={s} color={COLORS.text}>  {s}</Text>
          ))}
          {suggestions.length > 10 && (
            <Text color={COLORS.chrome}>  ... and {suggestions.length - 10} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
