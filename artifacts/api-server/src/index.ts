import app from "./app";
import { logger } from "./lib/logger";
import { client, db, scansTable, runMigrations } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 38080;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Wrap startup in an async IIFE so this module is compatible with both ESM
// (top-level await) and CJS (esbuild --format=cjs for Node.js SEA builds).
(async () => {
  // ── Step 1: Ensure schema exists ──────────────────────────────────────────
  // On a brand-new installation the SQLite file is empty — no tables exist.
  // runMigrations() detects this and applies the full schema atomically.
  // On subsequent launches it is a cheap no-op (single SELECT on sqlite_master).
  try {
    await runMigrations(client);
    logger.info("Database schema verified");
  } catch (err) {
    logger.error({ err }, "Fatal: database migration failed — cannot start");
    process.exit(1);
  }

  // ── Step 2: Clean up interrupted scans ────────────────────────────────────
  // Mark any scans that were left "running" from a previous server session as
  // failed. Without this, an interrupted scan would stay stuck at "running"
  // forever and block the UI from starting a new scan.
  // This must run AFTER migrations so scansTable is guaranteed to exist.
  try {
    const cleaned = await db
      .update(scansTable)
      .set({
        status: "failed",
        errorMessage: "Server restarted while scan was in progress",
        completedAt: new Date(),
      })
      .where(eq(scansTable.status, "running"))
      .returning({ id: scansTable.id });
    if (cleaned.length > 0) {
      logger.warn({ count: cleaned.length }, "Marked interrupted scans as failed on startup");
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean up interrupted scans on startup");
  }

  // ── Step 3: Start accepting requests ─────────────────────────────────────
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
