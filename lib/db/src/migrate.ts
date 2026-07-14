/**
 * runMigrations — ensures the SQLite schema exists before any queries run.
 *
 * On a brand-new database the scans table (and every other table) will be
 * missing.  This function detects that state and applies the full schema in
 * a single atomic batch.  Subsequent calls are no-ops because the sentinel
 * table is present.
 *
 * The SQL is inlined from lib/db/src/migrations-snapshot.ts so no external
 * files are needed at runtime inside the @yao-pkg/pkg binary.
 *
 * Regenerate migrations-snapshot.ts after any schema change:
 *   pnpm --filter @workspace/db exec drizzle-kit generate
 *   node lib/db/scripts/codegen-migrations.mjs
 */

import type { Client } from "@libsql/client";
import { migrationStatements } from "./migrations-snapshot";

export async function runMigrations(client: Client): Promise<void> {
  // Check whether the schema has already been initialised by looking for the
  // scans table, which is always the first table created.
  const probe = await client.execute(
    "SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='scans'"
  );
  const count = Number((probe.rows[0] as Record<string, unknown>)["n"] ?? 0);
  if (count > 0) {
    return; // Schema already in place — nothing to do.
  }

  // First launch: apply the full schema in one deferred (transactional) batch.
  await client.batch(
    migrationStatements.map((sql) => ({ sql, args: [] as never[] })),
    "deferred"
  );
}
