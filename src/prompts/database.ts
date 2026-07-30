import { select, input } from "@inquirer/prompts";
import { ConnParams, listDatabases, createDatabaseIfMissing } from "../db/mysql";
import * as ui from "../ui/theme";
import { GoBack } from "../ui/nav";

const NEW_DB = "__new__";
const BACK = "__back__";

export async function pickDatabase(conn: ConnParams, label: string): Promise<string> {
  const databases = await listDatabases(conn);
  if (databases.length === 0) {
    throw new Error(`No databases found on ${label} (or connection failed).`);
  }
  const choice = await select({
    message: `Select ${label} database:`,
    choices: [
      ...databases.map((d) => ({ name: d, value: d })),
      { name: ui.dim("‹ Back"), value: BACK },
    ],
  });
  if (choice === BACK) throw new GoBack();
  return choice;
}

// promptLines lets the caller know how many terminal lines this left behind
// (1 for picking an existing db, 2 if a new-db name had to be typed too) so
// it can be collapsed into a single breadcrumb line afterward.
export async function pickOrCreateTargetDatabase(
  conn: ConnParams
): Promise<{ dbName: string; promptLines: number }> {
  const databases = await listDatabases(conn);
  const choice = await select({
    message: "Select target database (local):",
    choices: [
      ...databases.map((d) => ({ name: d, value: d })),
      { name: "+ Create new database", value: NEW_DB },
      { name: ui.dim("‹ Back"), value: BACK },
    ],
  });
  if (choice === BACK) throw new GoBack();

  let dbName = choice;
  let promptLines = 1;
  if (choice === NEW_DB) {
    dbName = await input({
      message: "New database name:",
      validate: (v) => v.trim().length > 0 || "Required",
    });
    promptLines = 2;
  }

  await createDatabaseIfMissing(conn, dbName);
  return { dbName, promptLines };
}
