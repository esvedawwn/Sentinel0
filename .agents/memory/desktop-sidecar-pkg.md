---
name: Desktop sidecar packaging
description: Why @yao-pkg/pkg is used instead of Node.js SEA/postject for the macOS arm64 sidecar binary.
---

## Rule
Always use `@yao-pkg/pkg` (not Node.js SEA/postject) for the macOS arm64 sidecar binary.

## Why
Node.js SEA/postject was confirmed to produce a segfaulting binary on arm64 macOS even when:
- An official nodejs.org binary (not Homebrew) was used as the injection base
- Blob generation, injection, fuse verification, and ad-hoc codesigning all reported success
- `SENTINEL_SMOKE_TEST=1 ./server` → `zsh: segmentation fault`

Homebrew's `node@22` strips the SEA fuse marker (`NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`).
Downloading an official binary worked around the fuse issue but the resulting binary still segfaulted.
Root cause is a fundamental incompatibility — do not retry SEA on this project.

## How to apply
- `artifacts/desktop/scripts/build-server.mjs` — uses `@yao-pkg/pkg@5` with target `node22-macos-arm64`
- `@libsql/darwin-arm64.node` is packaged as a pkg asset (auto-detected), extracted to temp dir at runtime
- If macOS Gatekeeper blocks the extracted `.node` file: `xattr -cr <sidecar-binary>`
- pkg downloads its own Node.js 22 runtime to `~/.pkg-cache` (first run ~70 MB, then cached)
- Smoke test uses `SENTINEL_SMOKE_TEST=1` which fires before any native module loads
- Health check (step 6) is the only step that exercises `@libsql/darwin-arm64.node` at runtime
