# Dumpster CLI — Ink TUI Redesign

## Problem

Current UI (`@inquirer/prompts` + manual `console.log`/`clearLines`) has two problems:

1. **Persistence bugs**: finished prompts are erased via hardcoded `ui.clearLines(n)` calls scattered across `index.ts`/`prompts/*`. Counts drift out of sync with what was actually printed, so old questions/answers pile up in the scrollback instead of collapsing into breadcrumbs.
2. **Clumsy visuals**: neon gradient figlet banner, ad-hoc chalk colors per message type, inconsistent box-drawing (`summaryBox`) — no single layout owns the screen.

## Goals

- Zero leftover clutter: every step fully replaces the previous one on screen.
- Persistent breadcrumb trail showing prior choices (source, target, etc.) instead of raw prompt history.
- Consistent back/quit navigation without exception-based control flow (`GoBack`).
- Minimal, calm visual style — one accent color, plain borders.

## Non-goals

- No changes to `src/db/*` (mysql, dump, clone, speed) or `src/config/*` (crypto, store, types) — pure DB/config logic stays as-is.
- No new CLI flags/subcommands — same three actions (remote sources, dump to local, dump to file).

## Approach

Replace the imperative prompt loop with an **Ink** (React-for-CLI) full-screen app rendered on the alt-screen buffer, so each render fully overwrites the previous frame — no manual line-clearing.

### State machine

`src/ui/App.tsx` owns a `screen` union and a `history: Screen[]` stack:

```ts
type Screen =
  | { kind: "menu" }
  | { kind: "remoteSources" }
  | { kind: "pickServer"; purpose: "remote" | "local" }
  | { kind: "pickDatabase"; conn: ConnParams; serverName: string }
  | { kind: "localTarget" }
  | { kind: "progress"; job: DumpJob | CloneJob }
  | { kind: "summary"; lines: string[] };
```

Navigating forward pushes onto `history`; `esc` pops it (replacing the current `GoBack` exception pattern in `index.ts`/`prompts/server.ts`/`prompts/database.ts`). `q` / `ctrl+c` exits from any screen.

Breadcrumb state (`source`, `target`, `output`) is separate top-level state set when a screen resolves, and rendered in a persistent `<Breadcrumbs>` header regardless of which screen is active — this replaces `ui.breadcrumb()` + `clearLines()` calls in `index.ts`.

### Layout

Fixed three-region frame, redrawn every render:

```
┌ dumpster ───────────────────────────────┐
│ <Breadcrumbs>                            │  always visible, accumulates as steps resolve
├──────────────────────────────────────────┤
│ <active screen component>                │  current interactive prompt
├──────────────────────────────────────────┤
│ <Footer> ↑↓ move · enter select · esc back · q quit │
└──────────────────────────────────────────┘
```

### Components (`src/ui/`)

- `App.tsx` — state machine, renders frame + routes to active screen
- `Breadcrumbs.tsx` — renders accumulated choices
- `Footer.tsx` — static keybind hint line
- `screens/Menu.tsx` — top-level action select (replaces inline `select()` in `index.ts`)
- `screens/RemoteSources.tsx` — replaces `manageRemoteSources()` (add/edit/remove servers)
- `screens/ServerPicker.tsx` — replaces `pickServer()`
- `screens/DatabasePicker.tsx` — replaces `pickDatabase()` / `pickOrCreateTargetDatabase()`
- `screens/LocalTarget.tsx` — replaces `getLocalTarget()`
- `screens/Progress.tsx` — wraps existing dump/clone progress events in an Ink progress bar (replaces `cli-progress` + `barFormat`)
- `screens/Summary.tsx` — replaces `ui.summaryBox()`

`theme.ts` shrinks to a palette module: one accent (cyan) for focus/selection, gray for chrome text, green/red reserved for success/error only. Figlet + gradient banner dropped for a plain one-line title in the header.

### Data flow into DB layer

`src/db/*` functions (`estimateDatabaseSize`, `dumpToFile`, `cloneDatabase`) are unchanged. Progress/status events they currently push via callbacks into `cli-progress` will instead update React state consumed by `screens/Progress.tsx` — the callback signature stays the same, only the consumer changes.

### Error handling

Errors thrown by DB operations are caught at the `App.tsx` level and routed to a `{ kind: "summary" }`-like error screen (reuses `Summary` styling with red accent) rather than `console.error` + `process.exit`, except for the startup binary check (`mysqldump`/`mysql` on PATH), which still exits before the Ink app mounts since there's nothing useful to navigate to.

## Testing

- Manual walkthrough of both flows (dump-to-file, dump-to-local-clone) plus remote-sources add/edit/remove, checking: no leftover frames, breadcrumbs accurate, esc/back and q/quit work from every screen.
- No unit tests currently exist for the UI layer; none added — this is a rendering-layer swap, not new business logic. DB layer keeps whatever tests it already has.

## Migration scope

Touched: `src/index.ts`, `src/prompts/*` (deleted, logic folded into `src/ui/screens/*`), `src/ui/*` (rewritten).
Untouched: `src/db/*`, `src/config/*`.
New dependency: `ink`, `ink-select-input` (or equivalent), `ink-text-input`; drop `@inquirer/prompts`, `figlet`, `gradient-string`, `cli-progress` (Ink has its own spinner/progress patterns) once migration is complete.
