import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { CONFIG_DIR } from "./crypto";
import { ConfigFile, LocalTarget, ServerProfile } from "./types";

const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
}

// Older versions stored servers grouped under named "projects", with a
// role: "remote" | "local" tag per server. Flatten that into the current
// { servers, localTarget } shape, promoting the first "local" server found.
function migrateLegacyShape(raw: any): ConfigFile | null {
  if (!raw || !Array.isArray(raw.projects)) return null;

  const servers: ServerProfile[] = [];
  let localTarget: LocalTarget | undefined;

  for (const project of raw.projects) {
    for (const s of project.servers ?? []) {
      if (s.role === "local" && !localTarget) {
        localTarget = { host: s.host, port: s.port, user: s.user, passwordEnc: s.passwordEnc };
      } else {
        servers.push({
          id: s.id,
          name: s.name,
          host: s.host,
          port: s.port,
          user: s.user,
          passwordEnc: s.passwordEnc,
        });
      }
    }
  }

  return { servers, localTarget };
}

export function loadConfig(): ConfigFile {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { servers: [] };
  }
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  if (!raw.trim()) return { servers: [] };
  const parsed = JSON.parse(raw);

  const migrated = migrateLegacyShape(parsed);
  if (migrated) {
    saveConfig(migrated);
    return migrated;
  }

  return parsed as ConfigFile;
}

export function saveConfig(config: ConfigFile): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function addServer(server: Omit<ServerProfile, "id">): ServerProfile {
  const config = loadConfig();
  const full: ServerProfile = { id: crypto.randomUUID(), ...server };
  config.servers.push(full);
  saveConfig(config);
  return full;
}

export function updateServer(id: string, updates: Omit<ServerProfile, "id">): ServerProfile {
  const config = loadConfig();
  const server = config.servers.find((s) => s.id === id);
  if (!server) throw new Error(`Server ${id} not found`);
  Object.assign(server, updates);
  saveConfig(config);
  return server;
}

export function removeServer(id: string): void {
  const config = loadConfig();
  config.servers = config.servers.filter((s) => s.id !== id);
  saveConfig(config);
}

export function setLocalTarget(target: LocalTarget): void {
  const config = loadConfig();
  config.localTarget = target;
  saveConfig(config);
}

export { CONFIG_FILE };
