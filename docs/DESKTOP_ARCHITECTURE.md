# Sentinel Desktop Architecture

Sentinel ships as both a **web app** (React + Express in the browser) and a
**macOS desktop app** (Tauri v2 wrapping the same React frontend + a bundled
Node.js sidecar).

---

## Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  macOS App (Tauri v2)                                              │
│                                                                    │
│  ┌──────────────────────┐       ┌──────────────────────────────┐   │
│  │  React Frontend      │ HTTP  │  Node.js SEA Sidecar         │   │
│  │  (Sentinel Vite app) │◄─────►│  (Express API, port 38080)   │   │
│  │                      │       │                              │   │
│  │  @tauri-apps/api     │  IPC  │  SENTINEL_DB_PATH →          │   │
│  │  window.__TAURI__    │◄─────►│  ~/Library/Application       │   │
│  └──────────────────────┘       │  Support/dev.sentinel.app/   │   │
│                                 │  sentinel.db                 │   │
│                                 └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

The **Tauri shell** manages the app lifecycle:
1. On startup, spawns the Express API server as a background sidecar on
   `localhost:38080`, passing `SENTINEL_DB_PATH` pointed at the macOS
   Application Support directory.
2. Loads the pre-built React frontend from `artifacts/sentinel/dist/`.
3. Exposes two custom IPC commands to the frontend:
   - `pick_folder` — opens the native macOS folder-picker dialog
   - `get_app_data_dir` — returns the Application Support path

---

## Repository Layout

```
artifacts/
  desktop/                    ← Tauri workspace package
    src-tauri/
      src/
        main.rs               ← entry point (calls lib::run)
        lib.rs                ← IPC commands + sidecar spawn + plugin setup
      Cargo.toml              ← Tauri v2 + plugins
      tauri.conf.json         ← product name, sidecar config, CSP
      capabilities/
        default.json          ← IPC permissions (core:default, shell, dialog)
    scripts/
      build-server.mjs        ← bundles api-server → Node.js SEA binary
    package.json              ← @workspace/desktop (tauri dev / build)

  api-server/                 ← Express API (also runs standalone in web mode)
  sentinel/                   ← React + Vite frontend
```

---

## Sidecar Build Pipeline

The Express API server is packaged as a **self-contained binary** using
[`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) so it can run inside the
Tauri bundle without requiring a Node.js installation on the user's machine.
`@yao-pkg/pkg` downloads and embeds its own verified Node.js 22 arm64 runtime
(cached in `~/.pkg-cache` after the first download).

> **Why not Node.js SEA/postject?** Homebrew's `node@22` strips the SEA fuse
> marker that postject requires, and even with an official Node.js binary the
> resulting arm64 binary segfaults on macOS. `@yao-pkg/pkg` has no such
> requirement and produces a stable binary.

### Steps (run by `pnpm desktop:build:server`)

1. **Bundle** — `esbuild` produces `artifacts/api-server/dist-sea/index.cjs`
   (CJS format) plus Pino worker files.
2. **Config** — `pkg-config.json` is written listing worker scripts and the
   native `@libsql/darwin-arm64` asset path.
3. **Stage native module** — `@libsql/darwin-arm64` (the SQLite native binding)
   is copied as real files into `dist-sea/node_modules/` so pkg can detect and
   package the `.node` file. Auto-installed via npm if not in the pnpm store
   (expected on a fresh macOS clone, since the lockfile is generated on Linux).
4. **Package** — `@yao-pkg/pkg` snapshots `index.cjs` + native assets into a
   single `node22-macos-arm64` binary, then the staging directory is removed.
5. **Verify** — size check (> 30 MB), `file` command confirms Mach-O arm64.
6. **Smoke test** — `SENTINEL_SMOKE_TEST=1` exits 0 and prints
   `sentinel-sidecar-smoke-test: ok` (fires before any native module loads).
7. **Health check** — sidecar starts on a temp port; `GET /api/healthz` → 200
   (first check that exercises `@libsql/darwin-arm64.node`).
8. **Place** — output is `src-tauri/binaries/server-<rust-target-triple>`
   (the naming convention required by Tauri's sidecar mechanism).

### Full macOS build

```bash
pnpm desktop:build:server              # package the Node.js sidecar
pnpm --filter @workspace/sentinel run build   # build React frontend
pnpm desktop:build                     # tauri build → Sentinel.app + .dmg
```

> **Rust/Cargo is required** — only available on macOS/Linux. The Tauri
> compile step cannot run in the Replit web environment.

---

## IPC Commands

Both commands are registered in `src-tauri/src/lib.rs` and can be called
from the frontend via `window.__TAURI__.core.invoke(name)`.

| Command | Rust signature | Returns |
|---------|---------------|---------|
| `pick_folder` | `fn pick_folder(app: AppHandle) -> Option<String>` | Chosen path string, or `null` if cancelled |
| `get_app_data_dir` | `fn get_app_data_dir(app: AppHandle) -> Option<String>` | App data dir path string |

### Frontend bridge (`artifacts/sentinel/src/lib/desktop.ts`)

```ts
import { isDesktop, pickFolder, getAppDataDir } from "@/lib/desktop";

if (isDesktop()) {
  const folder = await pickFolder(); // opens native macOS dialog
}
```

`isDesktop()` checks for `window.__TAURI__` (injected with
`withGlobalTauri: true` in `tauri.conf.json`). All three functions are
no-ops in browser/web mode.

---

## Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-shell` | Spawns the sidecar and opens external URLs |
| `tauri-plugin-dialog` | Provides `pick_folder` native dialog (Rust side) |
| `tauri-plugin-log` | Structured logging to system log |
| `tauri-plugin-updater` | Auto-update support (future) |

---

## Database

In desktop mode, SQLite is stored at the OS Application Support path:

- **macOS**: `~/Library/Application Support/dev.sentinel.app/sentinel.db`
- **Windows**: `%APPDATA%\dev.sentinel.app\sentinel.db`

In web/development mode, `SENTINEL_DB_PATH` is read from the environment
(defaults to `~/.sentinel/sentinel.db`).

---

## Development Workflow

```bash
# Terminal 1 — API server (web mode)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Vite dev server (web mode)
pnpm --filter @workspace/sentinel run dev

# Terminal 3 — Tauri dev mode (desktop, macOS only)
pnpm --filter @workspace/desktop run dev
# Requires: Rust/Cargo, the SEA binary in src-tauri/binaries/
```

In Tauri dev mode, the frontend devUrl is `http://localhost:18756` (the
sentinel Vite server) and live reload works.

---

## Security Notes

- CSP is set to `null` in `tauri.conf.json` for the current alpha — this
  is intentional for local-only operation and will be tightened before
  any public release.
- Capabilities grant only `core:default`, `shell:allow-execute/open`, and
  `dialog:allow-open` — no filesystem read/write permissions are granted
  to the JS layer; all FS access happens through the Express API.
- No file contents are ever stored in the database or transmitted to
  external services in local-only mode.
