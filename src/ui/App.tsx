import React, { useEffect, useState } from "react";
import { useApp, useInput, Box, Text } from "ink";
import * as path from "path";
import { Frame, Crumb } from "./Frame";
import { Menu, MenuAction } from "./screens/Menu";
import { ServerPicker } from "./screens/ServerPicker";
import { ServerForm, ServerFormValues } from "./screens/ServerForm";
import { RemoteSources, ServerActions, ConfirmRemove, RemovePicker } from "./screens/RemoteSources";
import { DatabasePicker, Loading, NewDatabaseName } from "./screens/DatabasePicker";
import { PathInput } from "./screens/PathInput";
import { Progress, ProgressState } from "./screens/Progress";
import { Summary } from "./screens/Summary";
import { Credits } from "./screens/Credits";
import { COLORS } from "./theme";
import { ServerProfile } from "../config/types";
import { loadConfig, addServer, updateServer, removeServer, setLocalTarget } from "../config/store";
import { encryptPassword, decryptPassword } from "../config/crypto";
import {
  ConnParams,
  serverToConnParams,
  listDatabases,
  createDatabaseIfMissing,
  estimateDatabaseSize,
  testConnection,
} from "../db/mysql";
import { dumpToFile } from "../db/dump";
import { cloneDatabase } from "../db/clone";

type Screen =
  | { kind: "menu" }
  | { kind: "remoteSources" }
  | { kind: "serverActions"; server: ServerProfile }
  | { kind: "confirmRemove"; server: ServerProfile }
  | { kind: "removePicker" }
  | { kind: "serverForm"; mode: "add" | "edit"; server?: ServerProfile; status?: { kind: "info" | "err"; text: string } | null; returnTo: "remoteSources" | "pickSource" }
  | { kind: "pickServer" }
  | { kind: "loadingDbs"; server: ServerProfile; conn: ConnParams }
  | { kind: "pickDatabase"; server: ServerProfile; conn: ConnParams; databases: string[] }
  | { kind: "outputPath"; server: ServerProfile; conn: ConnParams; database: string; defaultPath: string }
  | { kind: "loadingLocal" }
  | { kind: "localForm"; status?: { kind: "info" | "err"; text: string } | null }
  | { kind: "loadingTargetDbs"; sourceServer: ServerProfile; sourceConn: ConnParams; database: string; targetConn: ConnParams }
  | { kind: "pickTargetDatabase"; sourceServer: ServerProfile; sourceConn: ConnParams; database: string; targetConn: ConnParams; databases: string[] }
  | { kind: "newTargetDb"; sourceServer: ServerProfile; sourceConn: ConnParams; database: string; targetConn: ConnParams }
  | { kind: "progress"; state: ProgressState; onFinish: () => void }
  | { kind: "summary"; kind2: "ok" | "err"; title: string; lines: string[] }
  | { kind: "credits" };

interface CrumbState {
  source?: string;
  target?: string;
  output?: string;
}

export const App: React.FC = () => {
  const app = useApp();
  const [stack, setStack] = useState<Screen[]>([{ kind: "menu" }]);
  const [crumbs, setCrumbs] = useState<CrumbState>({});
  const [servers, setServers] = useState<ServerProfile[]>(() => loadConfig().servers);

  const screen = stack[stack.length - 1];

  function refreshServers() {
    setServers(loadConfig().servers);
  }

  function push(s: Screen) {
    setStack((prev) => [...prev, s]);
  }
  function pop() {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }
  function reset() {
    setStack([{ kind: "menu" }]);
    setCrumbs({});
  }

  useInput((_i, key) => {
    if (key.escape) {
      // Reset crumbs contextually on back to menu
      if (stack.length === 2) setCrumbs({});
      pop();
    }
  });

  // Side effects for loading screens
  useEffect(() => {
    if (screen.kind === "loadingDbs") {
      const { conn } = screen;
      const s = screen.server;
      listDatabases(conn)
        .then((dbs) => {
          if (dbs.length === 0) {
            setStack((prev) => prev.slice(0, -1).concat({
              kind: "summary", kind2: "err", title: "No databases found",
              lines: [`Server '${s.name}' returned no non-system databases.`],
            }));
          } else {
            setStack((prev) => prev.slice(0, -1).concat({
              kind: "pickDatabase", server: s, conn, databases: dbs,
            }));
          }
        })
        .catch((err) => {
          setStack((prev) => prev.slice(0, -1).concat({
            kind: "summary", kind2: "err", title: "Failed to list databases",
            lines: [String(err.message ?? err)],
          }));
        });
    }
    if (screen.kind === "loadingLocal") {
      const cfg = loadConfig();
      if (cfg.localTarget) {
        const t = cfg.localTarget;
        const conn: ConnParams = { host: t.host, port: t.port, user: t.user, password: decryptPassword(t.passwordEnc), container: t.container };
        const ctx = dumpLocalCtxRef.current!;
        setStack((prev) => prev.slice(0, -1).concat({
          kind: "loadingTargetDbs",
          sourceServer: ctx.sourceServer,
          sourceConn: ctx.sourceConn,
          database: ctx.database,
          targetConn: conn,
        }));
      } else {
        setStack((prev) => prev.slice(0, -1).concat({ kind: "localForm" }));
      }
    }
    if (screen.kind === "loadingTargetDbs") {
      const { sourceServer, sourceConn, database, targetConn } = screen;
      listDatabases(targetConn)
        .then((dbs) => {
          setStack((prev) => prev.slice(0, -1).concat({
            kind: "pickTargetDatabase", sourceServer, sourceConn, database, targetConn, databases: dbs,
          }));
        })
        .catch((err) => {
          setStack((prev) => prev.slice(0, -1).concat({
            kind: "summary", kind2: "err", title: "Failed to list local databases",
            lines: [String(err.message ?? err)],
          }));
        });
    }
  }, [screen.kind]);

  // Ref-like storage for cross-screen dump-local context
  const dumpLocalCtxRef = React.useRef<{ sourceServer: ServerProfile; sourceConn: ConnParams; database: string } | null>(null);
  const flowRef = React.useRef<"dump-file" | "dump-local" | null>(null);

  // ---- Handlers ----

  function onMenu(a: MenuAction) {
    if (a === "remote-sources") push({ kind: "remoteSources" });
    else if (a === "credits") push({ kind: "credits" });
    else if (a === "dump-file") { flowRef.current = "dump-file"; push({ kind: "pickServer" }); }
    else { flowRef.current = "dump-local"; push({ kind: "pickServer" }); }
  }

  function onPickServer(s: ServerProfile) {
    const conn = serverToConnParams(s);
    setCrumbs((c) => ({ ...c, source: `${s.host} : (choosing db)` }));
    push({ kind: "loadingDbs", server: s, conn });
  }

  function onPickDatabase(server: ServerProfile, conn: ConnParams, db: string) {
    setCrumbs((c) => ({ ...c, source: `${server.host} : ${db}` }));
    if (flowRef.current === "dump-file") {
      const defaultOut = path.resolve(process.cwd(), `${db}_dump_${timestamp()}.sql`);
      push({ kind: "outputPath", server, conn, database: db, defaultPath: defaultOut });
    } else {
      dumpLocalCtxRef.current = { sourceServer: server, sourceConn: conn, database: db };
      push({ kind: "loadingLocal" });
    }
  }

  async function runDumpFile(server: ServerProfile, conn: ConnParams, db: string, outFile: string) {
    setCrumbs((c) => ({ ...c, output: outFile }));
    const state: ProgressState = { written: 0, total: 1, speedLabel: "-- MB/s", etaLabel: "--:--", label: `dumping ${db}` };
    push({ kind: "progress", state, onFinish: () => {} });
    try {
      const estimated = await estimateDatabaseSize(conn, db).catch(() => 0);
      await dumpToFile(conn, db, outFile, estimated, (u) => {
        setStack((prev) => {
          const top = prev[prev.length - 1];
          if (top.kind !== "progress") return prev;
          return [...prev.slice(0, -1), { ...top, state: { ...u, label: `dumping ${db}` } }];
        });
      });
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "summary", kind2: "ok", title: "Dump complete",
        lines: [`Database : ${db}`, `Saved to : ${outFile}`],
      }));
    } catch (err: any) {
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "summary", kind2: "err", title: "Dump failed",
        lines: [String(err.message ?? err)],
      }));
    }
  }

  async function runClone(targetConn: ConnParams, targetDb: string) {
    const ctx = dumpLocalCtxRef.current!;
    setCrumbs((c) => ({ ...c, target: targetDb }));
    try {
      await createDatabaseIfMissing(targetConn, targetDb);
    } catch (err: any) {
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "summary", kind2: "err", title: "Failed to create target database",
        lines: [String(err.message ?? err)],
      }));
      return;
    }
    const state: ProgressState = { written: 0, total: 1, speedLabel: "-- MB/s", etaLabel: "--:--", label: `cloning ${ctx.database} → ${targetDb}` };
    push({ kind: "progress", state, onFinish: () => {} });
    try {
      const estimated = await estimateDatabaseSize(ctx.sourceConn, ctx.database).catch(() => 0);
      await cloneDatabase(ctx.sourceConn, ctx.database, targetConn, targetDb, estimated, (u) => {
        setStack((prev) => {
          const top = prev[prev.length - 1];
          if (top.kind !== "progress") return prev;
          return [...prev.slice(0, -1), { ...top, state: { ...u, label: `cloning ${ctx.database} → ${targetDb}` } }];
        });
      });
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "summary", kind2: "ok", title: "Clone complete",
        lines: [`Source : ${ctx.database} (${ctx.sourceServer.name})`, `Target : ${targetDb} (local)`],
      }));
    } catch (err: any) {
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "summary", kind2: "err", title: "Clone failed",
        lines: [String(err.message ?? err)],
      }));
    }
  }

  async function submitLocalForm(v: ServerFormValues) {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top.kind !== "localForm") return prev;
      return [...prev.slice(0, -1), { ...top, status: { kind: "info", text: "Testing connection..." } }];
    });
    try {
      const conn: ConnParams = { host: v.host, port: v.port, user: v.user, password: v.password, container: v.container };
      await testConnection(conn);
      setLocalTarget({ host: v.host, port: v.port, user: v.user, passwordEnc: encryptPassword(v.password), container: v.container });
      const ctx = dumpLocalCtxRef.current!;
      setStack((prev) => prev.slice(0, -1).concat({
        kind: "loadingTargetDbs",
        sourceServer: ctx.sourceServer,
        sourceConn: ctx.sourceConn,
        database: ctx.database,
        targetConn: conn,
      }));
    } catch (err: any) {
      setStack((prev) => {
        const top = prev[prev.length - 1];
        if (top.kind !== "localForm") return prev;
        return [...prev.slice(0, -1), { ...top, status: { kind: "err", text: `Connection failed: ${err.message ?? err}` } }];
      });
    }
  }

  async function submitServerForm(v: ServerFormValues & { keepPassword?: boolean }, mode: "add" | "edit", server: ServerProfile | undefined, returnTo: "remoteSources" | "pickSource") {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top.kind !== "serverForm") return prev;
      return [...prev.slice(0, -1), { ...top, status: { kind: "info", text: "Testing connection..." } }];
    });
    try {
      const pass = mode === "edit" && v.keepPassword && server ? decryptPassword(server.passwordEnc) : v.password;
      await testConnection({ host: v.host, port: v.port, user: v.user, password: pass, container: v.container });
      let saved: ServerProfile;
      if (mode === "add") {
        saved = addServer({
          name: v.name, host: v.host, port: v.port, user: v.user,
          passwordEnc: encryptPassword(pass),
          container: v.container,
        });
      } else {
        saved = updateServer(server!.id, {
          name: v.name, host: v.host, port: v.port, user: v.user,
          passwordEnc: encryptPassword(pass),
          container: v.container,
        });
      }
      refreshServers();
      if (returnTo === "remoteSources") {
        setStack((prev) => prev.slice(0, -1));
      } else {
        // Chose to pick this server immediately
        setStack((prev) => prev.slice(0, -1));
        onPickServer(saved);
      }
    } catch (err: any) {
      setStack((prev) => {
        const top = prev[prev.length - 1];
        if (top.kind !== "serverForm") return prev;
        return [...prev.slice(0, -1), { ...top, status: { kind: "err", text: `Connection failed: ${err.message ?? err}` } }];
      });
    }
  }

  // ---- Crumbs for header ----
  const crumbList: Crumb[] = [];
  if (crumbs.source) crumbList.push({ label: "source", value: crumbs.source });
  if (crumbs.target) crumbList.push({ label: "target", value: crumbs.target });
  if (crumbs.output) crumbList.push({ label: "output", value: crumbs.output });

  // ---- Render ----
  let body: React.ReactNode = null;

  switch (screen.kind) {
    case "menu":
      body = <Menu onSelect={onMenu} />;
      break;

    case "remoteSources":
      body = (
        <RemoteSources
          servers={servers}
          onPickServer={(s) => push({ kind: "serverActions", server: s })}
          onNew={() => push({ kind: "serverForm", mode: "add", returnTo: "remoteSources" })}
          onRemovePicker={() => push({ kind: "removePicker" })}
        />
      );
      break;

    case "serverActions":
      body = (
        <ServerActions
          server={screen.server}
          onEdit={() => push({ kind: "serverForm", mode: "edit", server: screen.server, returnTo: "remoteSources" })}
          onRemove={() => push({ kind: "confirmRemove", server: screen.server })}
        />
      );
      break;

    case "removePicker":
      body = (
        <RemovePicker
          servers={servers}
          onPick={(s) => push({ kind: "confirmRemove", server: s })}
        />
      );
      break;

    case "confirmRemove":
      body = (
        <ConfirmRemove
          server={screen.server}
          onAnswer={(ok) => {
            if (ok) {
              removeServer(screen.server.id);
              refreshServers();
              setStack((prev) => prev.slice(0, -3).concat({ kind: "remoteSources" }));
            } else {
              pop();
            }
          }}
        />
      );
      break;

    case "serverForm": {
      const s = screen;
      body = (
        <ServerForm
          title={s.mode === "add" ? "Add MySQL server" : `Edit ${s.server?.name ?? ""}`}
          initial={s.server ? { name: s.server.name, host: s.server.host, port: s.server.port, user: s.server.user, container: s.server.container } : undefined}
          keepPasswordOption={s.mode === "edit"}
          status={s.status ?? null}
          onSubmit={(v) => submitServerForm(v, s.mode, s.server, s.returnTo)}
        />
      );
      break;
    }

    case "pickServer":
      if (servers.length === 0) {
        body = (
          <Box flexDirection="column">
            <Text color={COLORS.chrome}>No remote sources yet — add one first.</Text>
            <Box marginTop={1}>
              <ServerForm
                title="Add MySQL server"
                onSubmit={(v) => submitServerForm(v, "add", undefined, "pickSource")}
              />
            </Box>
          </Box>
        );
      } else {
        body = (
          <ServerPicker
            servers={servers}
            label="source"
            onPick={onPickServer}
            onNew={() => push({ kind: "serverForm", mode: "add", returnTo: "pickSource" })}
          />
        );
      }
      break;

    case "loadingDbs":
      body = <Loading text={`connecting to ${screen.server.name}...`} />;
      break;

    case "pickDatabase":
      body = (
        <DatabasePicker
          title="Select source database"
          databases={screen.databases}
          onPick={(db) => onPickDatabase(screen.server, screen.conn, db)}
        />
      );
      break;

    case "outputPath":
      body = (
        <PathInput
          title="Output file path"
          defaultPath={screen.defaultPath}
          onSubmit={(p) => runDumpFile(screen.server, screen.conn, screen.database, p)}
        />
      );
      break;

    case "loadingLocal":
      body = <Loading text="loading local target..." />;
      break;

    case "localForm":
      body = (
        <ServerForm
          title="Local MySQL connection"
          initial={{ host: "localhost", port: 3306, user: "root" }}
          status={screen.status ?? null}
          onSubmit={submitLocalForm}
        />
      );
      break;

    case "loadingTargetDbs":
      body = <Loading text="listing local databases..." />;
      break;

    case "pickTargetDatabase":
      body = (
        <DatabasePicker
          title="Select target database (local)"
          databases={screen.databases}
          allowCreate
          onPick={(db) => runClone(screen.targetConn, db)}
          onCreate={() => push({
            kind: "newTargetDb",
            sourceServer: screen.sourceServer,
            sourceConn: screen.sourceConn,
            database: screen.database,
            targetConn: screen.targetConn,
          })}
        />
      );
      break;

    case "newTargetDb":
      body = <NewDatabaseName onSubmit={(name) => runClone(screen.targetConn, name)} />;
      break;

    case "progress":
      body = <Progress state={screen.state} />;
      break;

    case "credits":
      body = <Credits onDone={() => pop()} />;
      break;

    case "summary":
      body = (
        <Summary
          kind={screen.kind2}
          title={screen.title}
          lines={screen.lines}
          onDone={() => { reset(); }}
        />
      );
      break;
  }

  const hint = screen.kind === "menu"
    ? "↑↓ move · enter select · ctrl+c quit"
    : screen.kind === "progress"
    ? "working... please wait"
    : screen.kind === "summary"
    ? "enter continue · ctrl+c quit"
    : "↑↓ move · enter select · esc back · ctrl+c quit";

  return <Frame crumbs={crumbList} hint={hint}>{body}</Frame>;
};

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
