---
name: Tauri desktop build config
description: Correct tauri.conf.json settings and frontend desktop-mode detection for Sentinel's Tauri v2 desktop build.
---

## Rules

- `frontendDist` must be `"../../sentinel/dist/public"` — Vite outputs to `dist/public`, not `dist`.
- `beforeBuildCommand` must set both required Vite env vars: `PORT=18756 BASE_PATH=/ pnpm --filter @workspace/sentinel run build`.
- `devUrl` is `http://localhost:18756` — run `pnpm desktop:vite` first to start Vite on that port.
- Desktop API base URL detection in `main.tsx`: check `window.__TAURI_INTERNALS__` (Tauri v2) or `window.__TAURI__` (v1 compat), then call `setBaseUrl("http://localhost:38080")`.

**Why:** The API server sidecar runs on port 38080; without `setBaseUrl`, all fetch calls go to relative paths which only work through the Replit proxy, not in a native WebView.

**How to apply:** Any time `tauri.conf.json` or `main.tsx` is modified, verify both the `frontendDist` path and the `setBaseUrl` call are present.
