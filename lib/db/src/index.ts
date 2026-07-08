import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "fs";
import path from "path";
import os from "os";
import * as schema from "./schema";

function getDbPath(): string {
  if (process.env.SENTINEL_DB_PATH) {
    return process.env.SENTINEL_DB_PATH;
  }
  return path.join(os.homedir(), ".sentinel", "sentinel.db");
}

const dbPath = getDbPath();
mkdirSync(path.dirname(dbPath), { recursive: true });

const client = createClient({
  url: `file:${dbPath}`,
});

export const db = drizzle({ client, schema });

export * from "./schema";
