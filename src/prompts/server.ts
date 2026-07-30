import { select, input, password as passwordPrompt, confirm } from "@inquirer/prompts";
import { ServerProfile } from "../config/types";
import { addServer, updateServer, removeServer, loadConfig } from "../config/store";
import { encryptPassword, decryptPassword } from "../config/crypto";
import { testConnection } from "../db/mysql";
import * as ui from "../ui/theme";
import { GoBack } from "../ui/nav";

const NEW_SERVER = "__new__";
const BACK = "__back__";

// Top-level "Remote sources" menu: list servers, add new, or drill into one to edit/remove.
export async function manageRemoteSources(): Promise<void> {
  for (;;) {
    const config = loadConfig();
    const choice = await select({
      message: "Remote sources",
      choices: [
        ...config.servers.map((s) => ({
          name: `${s.name}  ${ui.dim(`(${s.host}:${s.port})`)}`,
          value: s.id,
        })),
        { name: "+ Add new MySQL server", value: NEW_SERVER },
        { name: ui.dim("‹ Back"), value: BACK },
      ],
    });

    if (choice === BACK) return;
    if (choice === NEW_SERVER) {
      await createServer();
      continue;
    }
    const server = config.servers.find((s) => s.id === choice)!;
    await editServerMenu(server);
  }
}

async function editServerMenu(server: ServerProfile): Promise<void> {
  const action = await select({
    message: `${server.name} (${server.host}:${server.port})`,
    choices: [
      { name: "Edit", value: "edit" },
      { name: "Remove", value: "remove" },
      { name: ui.dim("‹ Back"), value: "back" },
    ],
  });

  if (action === "edit") {
    await editServer(server);
  } else if (action === "remove") {
    const ok = await confirm({ message: `Remove '${server.name}'?`, default: false });
    if (ok) {
      removeServer(server.id);
      ui.success("Removed.");
    }
  }
}

// Pick a server to use as the dump source (read-only picker, no add/edit here).
// allowBack controls whether "‹ Back" is offered — false when this is the first
// step of a flow (nothing to go back to except the caller's own handling).
export async function pickServer(label: string, allowBack = true): Promise<ServerProfile> {
  const config = loadConfig();
  if (config.servers.length === 0) {
    ui.info("No remote sources yet — let's add one.");
    return createServer();
  }
  const choice = await select({
    message: `Select ${label} server:`,
    choices: [
      ...config.servers.map((s) => ({
        name: `${s.name}  ${ui.dim(`(${s.host}:${s.port})`)}`,
        value: s.id,
      })),
      { name: "+ Add new MySQL server", value: NEW_SERVER },
      ...(allowBack ? [{ name: ui.dim("‹ Back"), value: BACK }] : []),
    ],
  });
  if (choice === BACK) throw new GoBack();
  if (choice === NEW_SERVER) {
    return createServer();
  }
  return config.servers.find((s) => s.id === choice)!;
}

async function createServer(): Promise<ServerProfile> {
  const name = await input({ message: "Server name (label):", validate: (v) => v.trim().length > 0 || "Required" });
  const host = await input({ message: "Host:", validate: (v) => v.trim().length > 0 || "Required" });
  const portStr = await input({ message: "Port:", default: "3306" });
  const user = await input({ message: "Username:", validate: (v) => v.trim().length > 0 || "Required" });
  const pass = await passwordPrompt({ message: "Password:" });

  const port = parseInt(portStr, 10) || 3306;

  ui.info("Testing connection...");
  await testConnection({ host, port, user, password: pass });
  ui.success("Connection OK.");

  return addServer({
    name: name.trim(),
    host: host.trim(),
    port,
    user: user.trim(),
    passwordEnc: encryptPassword(pass),
  });
}

async function editServer(server: ServerProfile): Promise<void> {
  const name = await input({ message: "Server name (label):", default: server.name });
  const host = await input({ message: "Host:", default: server.host });
  const portStr = await input({ message: "Port:", default: String(server.port) });
  const user = await input({ message: "Username:", default: server.user });
  const keepPass = await confirm({ message: "Keep existing password?", default: true });
  const pass = keepPass ? decryptPassword(server.passwordEnc) : await passwordPrompt({ message: "New password:" });

  const port = parseInt(portStr, 10) || 3306;

  ui.info("Testing connection...");
  await testConnection({ host, port, user, password: pass });
  ui.success("Connection OK.");

  updateServer(server.id, {
    name: name.trim(),
    host: host.trim(),
    port,
    user: user.trim(),
    passwordEnc: encryptPassword(pass),
  });
  ui.success("Saved.");
}
