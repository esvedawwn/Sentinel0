import { defineConfig } from "drizzle-kit";
import path from "path";
import os from "os";

const dbPath =
  process.env.SENTINEL_DB_PATH ?? path.join(os.homedir(), ".sentinel", "sentinel.db");

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
});
