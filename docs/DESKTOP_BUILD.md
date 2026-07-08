# Building Sentinel as a Desktop App

Sentinel can be compiled into a native desktop application (.dmg for macOS, .exe/.msi for Windows, .AppImage/.deb for Linux) using [Tauri](https://tauri.app/).

> **Note:** The Replit-hosted version of Sentinel continues to work unchanged after these steps. The desktop build is a separate artifact.

---

## Prerequisites

Install these once on your local machine.

### 1 — Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Verify: `rustc --version`

### 2 — System libraries (Linux only)

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf
```

### 3 — Node.js 22+ and pnpm

```bash
# Install Node.js via nvm or https://nodejs.org
npm install -g pnpm
```

---

## One-time setup

Clone/download the project, then:

```bash
pnpm install
```

---

## Build steps

### Step 1 — Build the API server binary

This packages the Express backend as a standalone executable (no Node.js required on the end user's machine):

```bash
pnpm --filter @workspace/desktop run build:server
```

This will:
- Bundle `artifacts/api-server` with esbuild → single `.cjs` file
- Use Node.js SEA to create a self-contained binary
- Place it in `artifacts/desktop/src-tauri/binaries/server-<target>`

> **macOS note:** SEA requires removing the existing code signature before injection and re-signing afterwards. The script handles this automatically, but Gatekeeper will still warn if you don't have a paid Apple Developer certificate. For personal use, right-click → Open to bypass the warning once.

### Step 2 — Build the Tauri app

```bash
pnpm --filter @workspace/desktop run build
```

Tauri will:
1. Build the Sentinel frontend (`artifacts/sentinel`) as static files
2. Compile the Rust shell in release mode
3. Bundle everything into a native installer

Output locations:
- **macOS:** `artifacts/desktop/src-tauri/target/release/bundle/dmg/Sentinel_*.dmg`
- **Windows:** `artifacts/desktop/src-tauri/target/release/bundle/nsis/Sentinel_*.exe`
- **Linux:** `artifacts/desktop/src-tauri/target/release/bundle/appimage/sentinel_*.AppImage`

---

## How it works at runtime

```
┌──────────────────────────────────────────────┐
│  Sentinel.app                                │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │  WebView        │  │  server binary  │   │
│  │  (React UI)     │◄─►  (Express API)  │   │
│  │                 │  │  :38080         │   │
│  └─────────────────┘  └─────────────────┘   │
│                         SQLite DB            │
│                         ~/Library/           │
│                         Application Support/ │
│                         dev.sentinel.app/    │
│                         sentinel.db          │
└──────────────────────────────────────────────┘
```

- Tauri spawns the `server` sidecar on port **38080** when the app starts
- The React UI detects it is running inside Tauri and points all API calls to `http://localhost:38080`
- The SQLite database is stored in the OS app-data directory (no setup required)
- No PostgreSQL, no cloud, no internet connection needed

---

## App icons

Replace the placeholder icon files in `artifacts/desktop/src-tauri/icons/` with your own:

| File | Size | Format |
|------|------|--------|
| `32x32.png` | 32×32 | PNG |
| `128x128.png` | 128×128 | PNG |
| `128x128@2x.png` | 256×256 | PNG |
| `icon.icns` | macOS bundle icon | ICNS |
| `icon.ico` | Windows icon | ICO |

Use [tauri-icon](https://github.com/tauri-apps/tauri-icon) or the Tauri CLI to generate all sizes from a single 1024×1024 PNG:

```bash
pnpm tauri icon path/to/icon-1024.png
```

---

## Distribution

### macOS
For distributing outside the App Store, you need:
- An Apple Developer account ($99/yr) for notarization
- Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` environment variables

Tauri handles notarization automatically when these are set during `tauri build`.

### Windows
Code signing is optional for personal use. For distribution, obtain a code-signing certificate and set the `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD` variables.

### Linux
AppImages are self-contained. `.deb` packages can be installed with `dpkg -i`.

---

## Development mode (no binary required)

For local development, run the API server and frontend separately:

```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
pnpm --filter @workspace/sentinel run dev

# Terminal 3 — Tauri dev shell (opens a native window pointing at the Vite dev server)
pnpm --filter @workspace/desktop run dev
```

In dev mode, Tauri opens a native window pointing at `http://localhost:18756` (the Vite dev server) and the UI auto-reloads on file changes.
