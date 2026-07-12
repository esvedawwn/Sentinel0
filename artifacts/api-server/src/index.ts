import app from "./app";
import { logger } from "./lib/logger";
import { db, scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 38080;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Mark any scans that were left "running" from a previous server session as
// failed. Without this, an interrupted scan would stay stuck at "running"
// forever and block the UI from starting a new scan.
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
