# Sentinel Desktop — macOS Release Guide

> **Version:** 0.1.0-alpha  
> **Target platform:** macOS 13 Ventura+ (Apple Silicon · Intel)  
> **Architecture:** Tauri v2 · @yao-pkg/pkg sidecar · SQLite local DB

---

## Quick start (Apple Silicon Mac)

```bash
# 1. Install prerequisites (once)
# Node.js: use nvm or volta — any version ≥ 18 works for running scripts.
# @yao-pkg/pkg downloads its own Node.js 22 runtime automatically.
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc && nvm install 22
npm install -g pnpm
# Or: brew install pnpm  (Homebrew pnpm is fine — only Node.js from Homebrew was problematic)
brew install imagemagick
curl https://sh.rustup.rs -sSf | sh
rustup target add aarch64-apple-darwin
xcode-select --install   # if not already installed

# 2. Clone and install
git clone <repo>
cd <repo>
pnpm install

# 3. Verify environment
pnpm desktop:check

# 4. Build the standalone server binary
pnpm desktop:build:server

# 5. Build and package the desktop app
pnpm desktop:build

# Sentinel.app is now in:
#   artifacts/desktop/src-tauri/target/release/bundle/macos/Sentinel.app
#   artifacts/desktop/src-tauri/target/release/bundle/dmg/Sentinel_0.1.0_aarch64.dmg
```

---

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| Node.js | ≥ 18 (for pnpm scripts) | nvm, volta, or any distribution |
| pnpm | ≥ 9 | `corepack enable pnpm` |
| Rust + Cargo | stable | `curl https://sh.rustup.rs -sSf \| sh` |
| Apple Silicon target | — | `rustup target add aarch64-apple-darwin` |
| Xcode CLI tools | — | `xcode-select --install` |
| ImageMagick | 7+ | `brew install imagemagick` (only for icon regen) |

---

## Development workflow (two terminals)

**Terminal 1 — Vite dev server:**
```bash
pnpm desktop:vite
# Starts the React/Vite frontend on http://localhost:18756
```

**Terminal 2 — Tauri dev window:**
```bash
pnpm desktop:dev
# Opens the native macOS window pointing to the Vite URL
# Hot-reloads automatically on frontend changes
```

> The API server is spawned automatically by Tauri as a sidecar process.  
> API calls from the desktop window go to `http://localhost:38080`.

---

## Build scripts reference

| Script | What it does |
|--------|-------------|
| `pnpm desktop:check` | Verify environment (Rust, Node, icons, sidecar binary) |
| `pnpm desktop:icons` | Regenerate all icon sizes from `src-tauri/icons/icon.png` |
| `pnpm desktop:build:server` | Compile the Express API as a self-contained binary via @yao-pkg/pkg → `src-tauri/binaries/server-<target>` |
| `pnpm desktop:build` | Build the frontend, compile Rust, bundle → `.app` + `.dmg` |
| `pnpm desktop:package` | Full pipeline: `desktop:build:server` + `desktop:build` |
| `pnpm desktop:vite` | Start Vite on port 18756 (dev only) |
| `pnpm desktop:dev` | Open Tauri dev window (run desktop:vite first) |

---

## Architecture

```
Sentinel.app/
├── Contents/
│   ├── MacOS/
│   │   ├── Sentinel                         ← Tauri/Rust executable
│   │   └── server-aarch64-apple-darwin      ← bundled API server (@yao-pkg/pkg)
│   ├── Resources/
│   │   └── …                                ← Tauri resources (icons, etc.)
│   └── Info.plist
```

**At launch, Tauri:**
1. Reads `app_data_dir` → `~/Library/Application Support/dev.sentinel.app/`
2. Spawns the sidecar server on `PORT=38080` with `SENTINEL_DB_PATH=<data_dir>/sentinel.db` and `NODE_ENV=production`
3. Opens a native WebView window serving `dist/public/index.html`
4. The frontend detects `window.__TAURI_INTERNALS__` and sets the API base URL to `http://localhost:38080`

---

## Sidecar build — how it works

`pnpm desktop:build:server` runs `artifacts/desktop/scripts/build-server.mjs`, which:

1. **Bundles** the Express server with esbuild (`--format=cjs --outdir=dist-sea`):
   - Entry: `artifacts/api-server/src/index.ts`
   - Output directory: `artifacts/api-server/dist-sea/`
   - `esbuild-plugin-pino` generates multiple CJS files:

     | File | Purpose |
     |------|---------|
     | `index.cjs` | **Main bundle — pkg entry point** |
     | `pino-worker.cjs` | Pino async-logging worker |
     | `thread-stream-worker.cjs` | Thread-stream worker |
     | `pino-file.cjs` | Pino file-transport worker |
     | `pino-pretty.cjs` | Pino pretty-print transport |

2. **Packages** with `@yao-pkg/pkg`:
   - Downloads a precompiled Node.js 22 arm64 runtime from pkg's CDN (cached in `~/.pkg-cache`)
   - Snapshots `dist-sea/index.cjs` and all pino worker CJS files into the binary
   - Packages native `.node` files (e.g. `@libsql/darwin-arm64.node`) as assets that are
     extracted to a temp directory at runtime
   - Output: a single self-contained `~60–80 MB` Mach-O arm64 executable

3. **Validates**:
   - Binary size > 30 MB (guards against a silent pkg failure)
   - Smoke test: `SENTINEL_SMOKE_TEST=1 ./server` → must print `sentinel-sidecar-smoke-test: ok` and exit 0
   - Health check: starts the server on a temp port, GETs `/api/healthz`, requires HTTP 200

4. **Places** the final binary at:
   ```
   artifacts/desktop/src-tauri/binaries/server-aarch64-apple-darwin
   ```

### Why @yao-pkg/pkg instead of Node.js SEA/postject

The Node SEA pipeline (node --experimental-sea-config + postject) has been abandoned for this project because:
- Homebrew's `node@22` strips the SEA fuse marker — postject fails
- Even with an official Node.js binary, the resulting binary segfaults on arm64 macOS
- `@yao-pkg/pkg` bundles a full, verified Node.js 22 runtime and handles native modules correctly

### Native module handling

`@libsql/darwin-arm64` (SQLite bindings) is a native `.node` addon.  
pkg packages it as an asset: the binary extracts it to a temp directory on first run.  
On macOS, if Gatekeeper blocks the extracted `.node` file:
```bash
xattr -cr artifacts/desktop/src-tauri/binaries/server-aarch64-apple-darwin
```

### Pino workers

`logger.ts` only loads the `pino-pretty` transport when `NODE_ENV !== "production"`.
The sidecar is always spawned with `NODE_ENV=production` (set in `lib.rs`), so pino workers
are never executed at runtime. They are included in the snapshot for completeness.

---

## Database

| Item | Path |
|------|------|
| SQLite file | `~/Library/Application Support/dev.sentinel.app/sentinel.db` |
| Logs | `~/Library/Logs/dev.sentinel.app/` |

All findings, scan history, approved folders, AI categories, semantic tags, settings, search history, and activity are persisted in SQLite across app restarts.

---

## Code signing (required for distribution)

> **Without code signing:** you can still run the app yourself by right-clicking → Open in Finder.  
> **For distribution to others:** a paid Apple Developer account is required.

```bash
# 1. List available signing identities
security find-identity -v -p codesigning

# 2. Sign the app (Developer ID Application certificate required)
codesign --deep --force --sign "Developer ID Application: <Your Name> (<TeamID>)" \
  "artifacts/desktop/src-tauri/target/release/bundle/macos/Sentinel.app"

# 3. Notarise with Apple (required for Gatekeeper on other Macs)
xcrun notarytool submit \
  "artifacts/desktop/src-tauri/target/release/bundle/dmg/Sentinel_0.1.0_aarch64.dmg" \
  --apple-id your@email.com \
  --team-id <TeamID> \
  --password <app-specific-password> \
  --wait

# 4. Staple the notarisation ticket
xcrun stapler staple \
  "artifacts/desktop/src-tauri/target/release/bundle/dmg/Sentinel_0.1.0_aarch64.dmg"
```

For unsigned ad-hoc testing on your own Mac:
```bash
codesign --sign - --force --deep \
  "artifacts/desktop/src-tauri/target/release/bundle/macos/Sentinel.app"
```

---

## macOS permissions

Sentinel scans files using the Node.js server process. On macOS Ventura+, the first scan of a folder outside `~/Downloads` or `~/Documents` triggers a **Full Disk Access** dialog. If it doesn't appear automatically:

1. System Settings → Privacy & Security → Full Disk Access
2. Click `+` and add `Sentinel.app`

Sentinel never modifies, moves, or deletes files.

---

## Folder picker

Use the native **Select Folder** dialog (also accessible from the Dashboard → New Scan).  
Only folders selected by the user are ever scanned — no ambient filesystem access.

---

## Installation

**From DMG:**
1. Open `Sentinel_0.1.0_aarch64.dmg`
2. Drag `Sentinel.app` → `/Applications`
3. Right-click → Open (first launch only, if unsigned)

**Manual (developer build):**
```bash
open artifacts/desktop/src-tauri/target/release/bundle/macos/Sentinel.app
```

---

## Uninstall

```bash
rm -rf /Applications/Sentinel.app
rm -rf ~/Library/Application\ Support/dev.sentinel.app
rm -rf ~/Library/Logs/dev.sentinel.app
```

---

## Updating

Tauri's `tauri-plugin-updater` is included in `Cargo.toml`. To wire up auto-updates, configure a `pubkey` and `endpoints` in `tauri.conf.json` under `plugins.updater`. For v0.1 this is intentionally disabled.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App opens but blank white screen | Check that the sidecar server started: Console.app → search "sentinel" |
| API calls fail / 404 | Confirm `window.__TAURI_INTERNALS__` is defined; base URL must be `http://localhost:38080` |
| "damaged and can't be opened" | Run `xattr -cr /Applications/Sentinel.app` |
| Gatekeeper blocks launch | Right-click → Open, or codesign with a Developer ID cert |
| Full Disk Access dialog never appeared | Grant manually in System Settings → Privacy & Security |
| `server-<target>` binary not found at build time | Run `pnpm desktop:build:server` |
| `zsh: segmentation fault` running the sidecar | Old SEA binary — run `pnpm desktop:build:server` to rebuild with pkg |
| Gatekeeper blocks native `.node` extraction | `xattr -cr artifacts/desktop/src-tauri/binaries/server-aarch64-apple-darwin` |
| Health check timeout: libsql fails to load | Gatekeeper blocked extracted `.node` — try the xattr fix above |
| pkg download fails (first run) | Check internet connectivity; retry `pnpm desktop:build:server` |
| Cargo build fails: `error[E0432]` | Run `rustup update` |
| Icons missing | Run `pnpm desktop:icons` |

---

## Known limitations (v0.1-alpha)

- Auto-update endpoint not configured (manual update only)
- Cloud AI features require explicit consent and remain off by default
- Intel Mac builds require `rustup target add x86_64-apple-darwin` and `tauri build --target x86_64-apple-darwin`
- Universal binary (fat binary) possible with `tauri build --target universal-apple-darwin` but increases build time

---

## Release checklist

- [ ] `pnpm desktop:check` passes
- [ ] `pnpm desktop:package` completes without errors
- [ ] `.app` launches and shows Dashboard
- [ ] Folder picker opens and scan completes successfully
- [ ] Settings persist across app restarts
- [ ] Scan history preserved across app restarts
- [ ] App signed (ad-hoc at minimum)
- [ ] Tested on Apple Silicon macOS 13+
- [ ] DMG created and openable
