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

### 3. Node.js 18+ and pnpm

Any Node.js distribution (Homebrew, nvm, Volta, official installer) works for
running pnpm scripts.  The sidecar builder (`@yao-pkg/pkg`) downloads and
caches its own Node.js 22 arm64 runtime in `~/.pkg-cache` — it does not use
your locally installed Node.js at all.

```bash
# Recommended: nvm (easy version switching)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc          # or ~/.bash_profile
nvm install 22 && nvm use 22
npm install -g pnpm
```

Alternatively — Volta:
```bash
curl https://get.volta.sh | bash
volta install node@22 pnpm
```

Or Homebrew (fine now that the build no longer needs the SEA fuse):
```bash
brew install node pnpm
```

### 4. Clone and install repo dependencies

```bash
git clone <your-repo-url> sentinel
cd sentinel
pnpm install
```

> **First-time pnpm install note:**  
> pnpm may prompt you to approve esbuild's build script:
> ```
> [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@x.y.z
> Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
> ```
> If you see this, run:
> ```bash
> pnpm approve-builds   # select esbuild → confirm
> pnpm install          # re-run to finish setup
> ```

---

## Step 1 — Build the server sidecar

The Express API server is packaged as a self-contained binary using
**@yao-pkg/pkg** and bundled into the `.app` as a sidecar.

```bash
pnpm --filter @workspace/desktop run build:server
```

This script (`artifacts/desktop/scripts/build-server.mjs`) uses **@yao-pkg/pkg** to produce a self-contained executable:

1. Bundles the API server with esbuild → `dist-sea/index.cjs`
2. Downloads a precompiled Node.js 22 arm64 runtime from pkg's CDN
   (cached in `~/.pkg-cache` — only downloaded once, ~70 MB)
3. Packages `index.cjs` + native modules into a single binary
4. Validates: size check (> 30 MB), smoke test, HTTP health check
5. Places the result at `src-tauri/binaries/server-aarch64-apple-darwin`

> **Why not Node.js SEA/postject?**
> Homebrew's `node@22` strips the SEA fuse marker so postject fails.
> Even with an official Node.js binary the resulting binary segfaults on arm64 macOS.
> `@yao-pkg/pkg` bundles its own verified Node.js runtime and handles native
> modules (like `@libsql/darwin-arm64`) correctly.

> **@yao-pkg/pkg** is installed automatically via npx on first run.

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
| `zsh: segmentation fault` when running sidecar | Old SEA binary still in place — run `pnpm desktop:build:server` to rebuild with pkg |
| pkg download fails on first run | Internet connectivity issue — retry `pnpm desktop:build:server` |
| Smoke test fails | Binary didn't execute — check if macOS blocked it: `xattr -cr <binary>` |
| Health check timeout | `@libsql/darwin-arm64.node` blocked by Gatekeeper: `xattr -cr <binary>` then retry |
| `FATAL: @libsql/darwin-arm64 is not installed` | Should no longer happen — step 2.5 auto-installs it. If it does, run `pnpm install` then retry |
| `FATAL: @yao-pkg/pkg exited ...` | See stdout — usually a missing module; ensure `pnpm install` ran |
| `error: linker 'cc' not found` | `xcode-select --install` |
| App opens but API fails | Check that port 38080 isn't in use (`lsof -i :38080`) |
| Gatekeeper blocks app | `codesign --force --deep --sign - Sentinel.app` |
| `SENTINEL_DB_PATH` not set | Already set in `src-tauri/lib.rs` sidecar spawn env |
| Binary is < 30 MB | pkg may have failed silently — rerun `pnpm desktop:build:server` and check output |

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
      server-aarch64-...    ← @yao-pkg/pkg sidecar (Express API + Node.js runtime)
```

On launch, the Tauri shell:
1. Spawns the sidecar as a background process on `localhost:38080`
2. Loads the React frontend in a native WebView
3. Routes `GET|POST /api/*` calls through to the sidecar
4. Exposes `pick_folder` and `get_app_data_dir` as Tauri IPC commands
