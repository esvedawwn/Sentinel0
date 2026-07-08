---
name: SQLite migration
description: How Sentinel migrated from PostgreSQL to SQLite, which libraries work in Replit, and the key pitfalls.
---

## SQLite adapter choice

Use `@libsql/client` + `drizzle-orm/libsql`. Ships pre-compiled platform binaries — no Python/node-gyp needed in Replit.

- `drizzle-orm/better-sqlite3` requires node-gyp + Python → fails in Replit (no Python available).
- `drizzle-orm/node-sqlite` does not exist in drizzle-orm v0.45.x.
- `@libsql/client` ships pre-built `@libsql/linux-x64-gnu` etc. — just works.

**Why:** Replit's NixOS sandbox has no Python interpreter by default, blocking any native addon compilation via node-gyp.

## esbuild externals

Add to `artifacts/api-server/build.mjs` externals list:
```
"@libsql/client", "libsql",
"@libsql/linux-x64-gnu", "@libsql/linux-arm64-gnu",
"@libsql/darwin-arm64", "@libsql/darwin-x64", "@libsql/win32-x64-msvc"
```

**Why:** esbuild bundles the code into `dist/index.mjs`. If libsql is bundled, Node.js cannot resolve its native binary at the path relative to `dist/`. Marking it external lets Node.js resolve it from `node_modules` at runtime.

## api-server must declare @libsql/client as a direct dependency

Even though `@workspace/db` depends on `@libsql/client`, the bundled server in `dist/` cannot reach transitive deps via pnpm's isolated node_modules. Add `@libsql/client` to `artifacts/api-server/package.json` dependencies too.

## drizzle-kit push — DB directory must pre-exist

`drizzle-kit push` calls `createClient()` before any app code runs, so it cannot create the directory itself. Create `~/.sentinel/` with `mkdir -p` before running push in CI or dev setup.

## SQL syntax changes (PostgreSQL → SQLite)

| PostgreSQL | SQLite |
|---|---|
| `sum(...)::int` | `sum(...)` (remove cast) |
| `coalesce(...)::bigint` | `coalesce(...)` |
| `array_length(tags, 1) = 0` | `json_array_length(tags) = 0` |
| `ilike(col, pattern)` | `like(col, pattern)` (SQLite LIKE is case-insensitive for ASCII) |
| `now() - interval 'N days'` | `datetime('now', '-N days')` |
| `started_at >= ...` (timestamp col) | compare against `strftime('%s', datetime(...))` since timestamps are stored as Unix ints |

## drizzle.config.ts

Use `dialect: "sqlite"` with `dbCredentials.url: "file:/path/to/db.sqlite"`. No explicit driver needed when `@libsql/client` is installed.

## DB path

- Default: `~/.sentinel/sentinel.db`
- Override: `SENTINEL_DB_PATH` env var
- Tauri desktop: Tauri passes `SENTINEL_DB_PATH` pointing to `app_data_dir()/sentinel.db`
