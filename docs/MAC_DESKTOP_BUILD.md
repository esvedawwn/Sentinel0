# Building Sentinel for macOS (Apple Silicon)

This guide walks through building a signed `.app` bundle and `.dmg` installer
for Sentinel on an Apple Silicon Mac (M1/M2/M3).

> **Replit environment**: Tauri builds require macOS tooling (Xcode, Rust, code-signing
> certificates) that cannot run inside Replit. Run all commands in this file on your
> local Mac. The project code lives in this repo — clone it locally to build.

---

## Prerequisites

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

Verify: `xcodebuild -version`

### 2. Rust (via rustup)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin   # Apple Silicon
rustup target add x86_64-apple-darwin    # Intel (for universal binary)
```

Verify: `rustc --version`

### 3. Node.js 22+ and pnpm

> **Important — do NOT use Homebrew's Node.js for builds.**
> Homebrew's `node@22` build strips the SEA fuse marker that the sidecar
> packaging requires.  `pnpm desktop:build:server` downloads a pinned official
> Node.js arm64 binary from nodejs.org automatically, so you do NOT need to
> reinstall Node — but your shell's `node` must be v22+ to run pnpm scripts.

```bash
# Recommended: install via nvm (uses official nodejs.org binaries)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc   # or ~/.bashrc / ~/.bash_profile
nvm install 22
nvm use 22
npm install -g pnpm
```

Alternatively — Volta:
```bash
curl https://get.volta.sh | bash
volta install node@22 pnpm
```

If you keep Homebrew Node for other projects, the build script still works —
it downloads and caches the official binary in `/tmp/` automatically.

### 4. Install repo dependencies

```bash
git clone <your-repo-url> sentinel
cd sentinel
pnpm install
```

---

## Step 1 — Build the Node.js SEA sidecar

The Express API server is packaged as a Node.js Single Executable Application
(SEA) and bundled into the `.app` as a sidecar binary.

```bash
pnpm --filter @workspace/desktop run build:server
```

This script (`artifacts/desktop/scripts/build-server.mjs`):
1. Downloads and caches the official Node.js v22.16.0 arm64 binary from nodejs.org
   (cached in `/tmp/` — only downloaded once)
2. Preflight: verifies the SEA fuse marker is present in that binary
3. Bundles the API server with esbuild → `dist-sea/index.cjs`
4. Generates a SEA blob via `node --experimental-sea-config`
5. Injects the blob using `postject` — any non-zero exit is **fatal** (no false success)
6. Verifies injection succeeded (fuse marker present, binary size ≥ 5 MB)
7. Re-signs the binary with an ad-hoc codesign
8. Places the result at `src-tauri/binaries/server-aarch64-apple-darwin`
9. Runs a smoke test (`SENTINEL_SMOKE_TEST=1`) — the binary must exit 0

> **Why an official binary?**  Homebrew's `node@22` strips the SEA fuse marker.
> The build script always downloads from nodejs.org so Homebrew installs work fine.

> **postject** is installed automatically via npx on first run.

### Verify

```bash
ls -lh artifacts/desktop/src-tauri/binaries/
# server-aarch64-apple-darwin   (for M1/M2/M3)
# server-x86_64-apple-darwin    (for Intel, if built)
```

---

## Step 2 — Build the frontend

```bash
pnpm --filter @workspace/sentinel run build
```

Output lands in `artifacts/sentinel/dist/` — this is what Tauri loads as the
webview content.

---

## Step 3 — Check Tauri config

Open `artifacts/desktop/src-tauri/tauri.conf.json` and confirm:

```json
{
  "bundle": {
    "externalBin": ["binaries/server"]
  }
}
```

The `externalBin` entry tells Tauri to include the sidecar binary in the app bundle.

---

## Step 4 — Build the desktop app

```bash
pnpm desktop:build
# or directly:
pnpm --filter @workspace/desktop run build
```

For an Apple Silicon-only build:

```bash
cd artifacts/desktop
pnpm tauri build --target aarch64-apple-darwin
```

For a universal binary (Intel + Apple Silicon):

```bash
cd artifacts/desktop
pnpm tauri build --target universal-apple-darwin
```

Output:
```
artifacts/desktop/src-tauri/target/release/bundle/
  macos/
    Sentinel.app      ← app bundle
  dmg/
    Sentinel_0.1.0_aarch64.dmg   ← installer
```

---

## Step 5 — Code signing (optional, for distribution)

### Self-signed (local testing only)

```bash
codesign --force --deep --sign - \
  artifacts/desktop/src-tauri/target/release/bundle/macos/Sentinel.app
```

### Apple Developer account (for Gatekeeper-verified distribution)

1. Log in to Xcode → Settings → Accounts → add your Apple ID
2. Set environment variables:
   ```bash
   export APPLE_CERTIFICATE="<base64-encoded-p12>"
   export APPLE_CERTIFICATE_PASSWORD="<p12-password>"
   export APPLE_ID="<your-apple-id>"
   export APPLE_PASSWORD="<app-specific-password>"
   export APPLE_TEAM_ID="<team-id>"
   ```
3. Add to `tauri.conf.json`:
   ```json
   "bundle": {
     "macOS": {
       "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
       "providerShortName": "TEAM_ID",
       "entitlements": "entitlements.plist"
     }
   }
   ```
4. Run `pnpm desktop:build` — Tauri handles signing and notarisation automatically.

---

## Running in dev mode

Dev mode uses Vite's HMR server instead of the pre-built frontend:

```bash
# Terminal 1 — start API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — start Tauri shell (opens native window pointing at localhost:18756)
pnpm desktop:dev
```

In dev mode, the sidecar is NOT spawned — the Tauri shell uses the already-running
API server and the Vite dev server for the frontend.

---

## Database location

| Mode | DB path |
|------|---------|
| Desktop app (macOS) | `~/Library/Application Support/dev.sentinel.app/sentinel.db` |
| Web (Replit) | `~/.sentinel/sentinel.db` (or `SENTINEL_DB_PATH` env var) |

Both use the same SQLite schema managed by Drizzle ORM.

---

## Checking without a full build

```bash
# Frontend TypeScript + Rust check (Rust requires local toolchain)
pnpm desktop:check

# Check Rust only
cd artifacts/desktop
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `server sidecar not found` | Run `pnpm desktop:build:server` first |
| `Could not find the sentinel NODE_SEA_FUSE_...` | Homebrew Node.js detected — the build script auto-downloads the official binary. Re-run `pnpm desktop:build:server`. |
| `FATAL: SEA fuse marker not found in cached binary` | Stale/corrupt cache — `rm -rf /tmp/sentinel-sea-node-*` then retry |
| `Download failed for Node.js v22.16.0` | Version no longer exists on nodejs.org — update `SEA_NODE_VERSION` in `build-server.mjs` |
| `Smoke test failed` | Binary did not execute — check stderr output; ensure codesign completed |
| `postject exited with code 1` | Injection failed — see stdout for root cause; delete cache and retry |
| `error: linker 'cc' not found` | `xcode-select --install` |
| App opens but API fails | Check that port 38080 isn't in use (`lsof -i :38080`) |
| Gatekeeper blocks app | `codesign --force --deep --sign - Sentinel.app` |
| `SENTINEL_DB_PATH` not set | Already set in `src-tauri/lib.rs` sidecar spawn env |
| Binary is < 5 MB | Blob not injected — delete `/tmp/sentinel-sea-inject-tmp` and rerun |

---

## Architecture summary

```
Sentinel.app/
  Contents/
    MacOS/
      Sentinel              ← Tauri shell (Rust binary)
    Resources/
      _up_/                 ← Vite-built React frontend
    Frameworks/             ← WebKit2 (system-provided on macOS)
    MacOS/
      server-aarch64-...    ← Node.js SEA sidecar (Express API)
```

On launch, the Tauri shell:
1. Spawns the SEA sidecar as a background process on `localhost:38080`
2. Loads the React frontend in a native WebView
3. Routes `POST /api/*` calls through to the sidecar
4. Exposes `pick_folder` and `get_app_data_dir` as Tauri IPC commands
