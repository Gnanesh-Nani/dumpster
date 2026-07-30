import { input, password as passwordPrompt } from "@inquirer/prompts";
import { ConnParams } from "../db/mysql";
import { loadConfig, setLocalTarget } from "../config/store";
import { encryptPassword, decryptPassword } from "../config/crypto";
import { testConnection } from "../db/mysql";
import * as ui from "../ui/theme";

export async function getLocalTarget(): Promise<ConnParams> {
  const config = loadConfig();
  if (config.localTarget) {
    const t = config.localTarget;
    return { host: t.host, port: t.port, user: t.user, password: decryptPassword(t.passwordEnc) };
  }

  ui.info("First time dumping to local — let's set up your local MySQL connection.");
  const host = await input({ message: "Local host:", default: "localhost" });
  const portStr = await input({ message: "Local port:", default: "3306" });
  const user = await input({ message: "Local username:", default: "root" });
  const pass = await passwordPrompt({ message: "Local password:" });
  const port = parseInt(portStr, 10) || 3306;

  ui.info("Testing connection...");
  await testConnection({ host, port, user, password: pass });
  ui.success("Connection OK. Saved as your default local target.");

  setLocalTarget({ host, port, user, passwordEnc: encryptPassword(pass) });
  return { host, port, user, password: pass };
}
