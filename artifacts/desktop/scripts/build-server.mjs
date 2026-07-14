/**
 * build-server.mjs — packages the Express API as a self-contained macOS arm64
 * binary using @yao-pkg/pkg.
 *
 * WHY @yao-pkg/pkg instead of Node.js SEA/postject:
 *   The SEA pipeline requires a Node.js binary that contains the SEA fuse
 *   marker (NODE_SEA_FUSE_...).  Homebrew's node@22 strips this marker so
 *   postject fails.  Even when an official binary is used and injection reports
 *   success the resulting binary segfaults on arm64 macOS.
 *
 *   @yao-pkg/pkg (community-maintained fork of vercel/pkg) downloads a
 *   precompiled Node.js runtime from its own CDN (cached in ~/.pkg-cache),
 *   snapshots the application JS into the binary, and packages native .node
 *   files as assets that are extracted to a temp directory at runtime.  No
 *   SEA fuse, no postject, no external Node.js binary required.
 *
 * WHY @libsql/darwin-arm64 needs explicit staging:
 *   @libsql/client selects its native binding with a fully dynamic require:
 *     const mod = `@libsql/${process.platform}-${process.arch}`;
 *     require(mod);
 *   pkg cannot statically detect this.  Additionally pnpm stores packages in a
 *   nested virtual store (.pnpm/) that pkg does not traverse when following
 *   symlinks for native .node files.  The solution is to copy every @libsql/*
 *   package to dist-sea/node_modules/ (real files, no symlinks) before pkg runs.
 *   pkg then resolves the chain: index.cjs → @libsql/client → @libsql/darwin-arm64
 *   through normal Node.js resolution from the bundle's own directory, and
 *   automatically detects and packages the .node file as a snapshot asset.
 *
 * Steps:
 *   0.  Remove stale sidecar binary
 *   1.  Bundle API server with esbuild → artifacts/api-server/dist-sea/index.cjs
 *   2.  Write pkg-config.json (pino worker scripts + native assets)
 *   2.5 Stage @libsql/* packages into dist-sea/node_modules/ (real files, no pnpm symlinks)
 *   3.  Run @yao-pkg/pkg → self-contained node22-macos-arm64 binary
 *   4.  Verify binary exists and is plausible size (> 30 MB)
 *   5.  Smoke test  — SENTINEL_SMOKE_TEST=1 → sentinel-sidecar-smoke-test: ok, exit 0
 *   6.  Health check — start sidecar on localhost, GET /api/healthz, require 200, shut down
 *
 * Requirements: Rust, pnpm, internet access on first run (pkg CDN ~70 MB download)
 *
 * Usage:  pnpm desktop:build:server
 */

import { execSync, spawnSync, spawn } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..", "..", "..");
const API_DIR   = join(ROOT, "artifacts", "api-server");
const DESKTOP   = join(__dirname, "..");
const BIN_DIR   = join(DESKTOP, "src-tauri", "binaries");
const DIST_SEA  = join(API_DIR, "dist-sea");

// ── Helpers ───────────────────────────────────────────────────────────────────
function fatal(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

function step(n, total, msg) {
  console.log(`\n[${n}/${total}] ${msg}`);
}

// ── Platform guard ────────────────────────────────────────────────────────────
if (os.platform() !== "darwin") {
  fatal("This build script targets macOS (darwin) only.");
}
if (os.arch() !== "arm64") {
  fatal(
    `This script targets Apple Silicon (arm64). Detected: ${os.arch()}.\n` +
    "       For Intel Macs, change PKG_TARGET to node22-macos-x64."
  );
}

// pkg target — @yao-pkg/pkg downloads its own Node.js runtime so this is
// independent of the user's locally installed Node.js version or distribution.
const PKG_TARGET = "node22-macos-arm64";

// ── Rust target triple ────────────────────────────────────────────────────────
let rustTarget;
try {
  rustTarget = execSync("rustc -vV", { encoding: "utf8" })
    .match(/host: (\S+)/)?.[1];
} catch {
  fatal("rustc not found. Install Rust: https://rustup.rs");
}
if (!rustTarget) fatal("Could not parse Rust target triple from `rustc -vV`.");

console.log(`\nSentinel sidecar build`);
console.log(`  Packaging  : @yao-pkg/pkg`);
console.log(`  Pkg target : ${PKG_TARGET}`);
console.log(`  Rust target: ${rustTarget}`);
console.log(`  Output     : src-tauri/binaries/server-${rustTarget}`);

const outputBin = join(BIN_DIR, `server-${rustTarget}`);

// ── Step 0: Remove stale sidecar ─────────────────────────────────────────────
step(0, 7, "Removing stale sidecar (if any)");
if (existsSync(outputBin)) {
  rmSync(outputBin);
  console.log(`  Removed: ${outputBin}`);
} else {
  console.log("  Nothing to remove");
}
// Also clean any stale staging directory from a previous failed run
const stagingDir = join(DIST_SEA, "node_modules");
if (existsSync(stagingDir)) {
  rmSync(stagingDir, { recursive: true, force: true });
  console.log("  Removed stale dist-sea/node_modules/");
}

// ── Step 1: Bundle API server with esbuild ────────────────────────────────────
step(1, 7, "Bundling API server with esbuild (format=cjs, outdir=dist-sea)");
execSync(`node ./build.mjs --format=cjs --outdir=dist-sea`, {
  cwd: API_DIR,
  stdio: "inherit",
});

const seaMainCjs = join(DIST_SEA, "index.cjs");
if (!existsSync(seaMainCjs)) {
  fatal(
    `Expected entry not found after build: ${seaMainCjs}\n` +
    "       Verify that artifacts/api-server/src/index.ts is the esbuild entry."
  );
}
const cjsFiles = readdirSync(DIST_SEA).filter((f) => f.endsWith(".cjs")).sort();
console.log("  CJS files in dist-sea/:");
cjsFiles.forEach((f) => console.log(`    ${f}`));

// ── Step 2: Write pkg-config.json ─────────────────────────────────────────────
step(2, 7, "Writing pkg-config.json");
// Include all generated .cjs worker files as scripts so pino's
// path.join(__dirname, './pino-worker.cjs') references resolve correctly
// inside the snapshot, even though NODE_ENV=production disables the
// pino-pretty transport (workers are never spawned in production).
//
// The assets list starts empty here; it will be extended in step 2.5 once we
// know the real path of the native @libsql/darwin-arm64.node file.
const pkgConfig = {
  scripts: cjsFiles
    .filter((f) => f !== "index.cjs")
    .map((f) => join("dist-sea", f)),
  assets: [],
};
console.log(`  Scripts: ${pkgConfig.scripts.join(", ") || "(none)"}`);

// ── Step 2.5: Stage @libsql/* packages for pkg ────────────────────────────────
//
// ROOT CAUSE of MODULE_NOT_FOUND for @libsql/darwin-arm64:
//   @libsql/client selects its native binding with a fully dynamic require:
//     const mod = `@libsql/${process.platform}-${process.arch}`;
//     require(mod);
//   pkg cannot statically detect this pattern, so it never includes the native
//   package in its snapshot.  Additionally, pnpm stores packages in a nested
//   virtual store (.pnpm/) whose symlinks pkg does not traverse for .node files.
//
// FIX: copy every resolvable @libsql/* package into dist-sea/node_modules/ as
//   real files (cpSync with dereference:true follows and expands all symlinks).
//   pkg then resolves the chain:
//     dist-sea/index.cjs
//       → dist-sea/node_modules/@libsql/client   (no pnpm symlinks involved)
//         → dist-sea/node_modules/@libsql/darwin-arm64
//           → darwin-arm64.node  ← pkg detects + packages as snapshot asset ✓
step("2.5", 7, "Staging @libsql/* packages into dist-sea/node_modules/");

// Resolve from the API server's package.json so Node follows the same module
// resolution that the running server uses.
const apiResolve = createRequire(join(API_DIR, "package.json"));

// All known @libsql/* packages — we try each and skip those not installed.
// This covers the native binding for every supported platform so the staging
// step is portable if someone adapts this for x64 or Linux.
const LIBSQL_PKGS = [
  "client",
  "core",
  "darwin-arm64",
  "darwin-x64",
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "win32-x64-msvc",
  "isomorphic-fetch",
];

let nativePkgPath = null;

for (const pkg of LIBSQL_PKGS) {
  try {
    const manifest = apiResolve.resolve(`@libsql/${pkg}/package.json`);
    // realpathSync follows ALL pnpm virtual-store symlinks to get the real path.
    const realDir  = realpathSync(dirname(manifest));
    const dest     = join(stagingDir, "@libsql", pkg);
    mkdirSync(dest, { recursive: true });
    // dereference:true expands symlinks inside the package so pkg gets plain files.
    cpSync(realDir, dest, { recursive: true, force: true, dereference: true });
    console.log(`  ✓ @libsql/${pkg}  →  dist-sea/node_modules/@libsql/${pkg}/`);
    if (pkg === "darwin-arm64") nativePkgPath = dest;
  } catch {
    // Not installed on this platform (e.g. linux-x64 on macOS arm64) — skip.
  }
}

if (!nativePkgPath) {
  fatal(
    "@libsql/darwin-arm64 is not installed in this workspace.\n" +
    "       Run:  pnpm install  then retry."
  );
}

// Find the .node binary inside the staged package and add it to assets.
// The glob "dist-sea/node_modules/@libsql/darwin-arm64/**" is relative to API_DIR.
const nativeRelDir = relative(API_DIR, nativePkgPath);
pkgConfig.assets.push(join(nativeRelDir, "**"));

// Write the config now that the assets list is complete.
const pkgConfigPath = join(API_DIR, "pkg-config.json");
writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2));
console.log(`  Config written: ${pkgConfigPath}`);
console.log(`  Assets: ${pkgConfig.assets.join(", ")}`);

// ── Step 3: Run @yao-pkg/pkg ──────────────────────────────────────────────────
// Downloads pkg-cache node22 binary on first run (~70 MB, cached in ~/.pkg-cache).
// Subsequent runs use the cached runtime.
step(3, 7, `Running @yao-pkg/pkg (target: ${PKG_TARGET})`);
console.log("  First run downloads the Node.js runtime — this may take a minute.");

mkdirSync(BIN_DIR, { recursive: true });

const pkgResult = spawnSync(
  "npx",
  [
    "--yes", "@yao-pkg/pkg@5",
    join("dist-sea", "index.cjs"),
    "--target", PKG_TARGET,
    "--output", outputBin,
    "--compress", "GZip",
    "--config", "pkg-config.json",
  ],
  { cwd: API_DIR, encoding: "utf8", stdio: "inherit" }
);

// Remove staging dir now that pkg has consumed it.
rmSync(stagingDir, { recursive: true, force: true });

if (pkgResult.error) {
  if (existsSync(outputBin)) rmSync(outputBin);
  fatal(`@yao-pkg/pkg could not be launched: ${pkgResult.error.message}`);
}
if (pkgResult.status !== 0) {
  if (existsSync(outputBin)) rmSync(outputBin);
  fatal(
    `@yao-pkg/pkg exited with code ${pkgResult.status}.\n` +
    "       No sidecar binary was produced.\n" +
    "       Common causes:\n" +
    "         • Network error downloading the Node.js runtime (~70 MB, first run only)\n" +
    "         • Module not found: check that pnpm install was run in the repo root\n" +
    "         • Unsupported target: verify @yao-pkg/pkg supports node22-macos-arm64"
  );
}

// ── Step 4: Verify binary ─────────────────────────────────────────────────────
step(4, 7, "Verifying binary");
if (!existsSync(outputBin)) {
  fatal(`Binary not found after pkg: ${outputBin}`);
}
const sizeMB = statSync(outputBin).size / (1024 * 1024);
if (sizeMB < 30) {
  rmSync(outputBin);
  fatal(
    `Binary is too small (${sizeMB.toFixed(1)} MB — expected > 30 MB).\n` +
    "       pkg may have failed silently. Check output above."
  );
}
execSync(`chmod +x "${outputBin}"`);
console.log(`  ✓ ${outputBin} (${sizeMB.toFixed(0)} MB)`);

// Verify it is an arm64 Mach-O executable
const fileOut = execSync(`file "${outputBin}"`, { encoding: "utf8" }).trim();
if (!fileOut.includes("arm64") && !fileOut.includes("Mach-O")) {
  rmSync(outputBin);
  fatal(`Binary does not appear to be a valid arm64 Mach-O executable:\n  ${fileOut}`);
}
console.log(`  ✓ ${fileOut.split(":")[1]?.trim()}`);

// ── Step 5: Smoke test ────────────────────────────────────────────────────────
// The CJS banner injected by build.mjs fires before any require() call,
// so no native module (.node file) is loaded.  This proves the binary
// executes without crashing and the JS entry point is intact.
step(5, 7, "Smoke test (SENTINEL_SMOKE_TEST=1)");
const smokeResult = spawnSync(outputBin, [], {
  env:      { ...process.env, SENTINEL_SMOKE_TEST: "1" },
  encoding: "utf8",
  timeout:  20_000,
  cwd:      ROOT,
});

if (smokeResult.error) {
  rmSync(outputBin);
  fatal(
    `Smoke test could not launch binary: ${smokeResult.error.message}\n` +
    "       Possible cause: macOS Gatekeeper blocked the unsigned binary.\n" +
    `       Try: xattr -cr "${outputBin}" then re-run.`
  );
}
if (smokeResult.status !== 0) {
  rmSync(outputBin);
  fatal(
    `Smoke test exited with code ${smokeResult.status}.\n` +
    `  stdout: ${smokeResult.stdout?.trim()}\n` +
    `  stderr: ${smokeResult.stderr?.trim()}`
  );
}
const smokeOut = (smokeResult.stdout ?? "").trim();
if (!smokeOut.includes("sentinel-sidecar-smoke-test: ok")) {
  rmSync(outputBin);
  fatal(
    `Smoke test did not print expected output.\n` +
    `  Expected: "sentinel-sidecar-smoke-test: ok"\n` +
    `  Got:      "${smokeOut}"`
  );
}
console.log(`  ✓ ${smokeOut}`);

// ── Step 6: Health check ──────────────────────────────────────────────────────
// Starts the sidecar on a temporary port with a temp SQLite DB, calls
// /api/healthz, verifies 200, then shuts the server down.
// This is the first step that exercises the native @libsql/darwin-arm64.node.
// If macOS Gatekeeper blocks the extracted .node file, this step will fail
// with a clear error message explaining how to resolve it.
step(6, 7, "Health check (start → GET /api/healthz → shut down)");

const HEALTH_PORT = 38099;
const HEALTH_DB   = join(os.tmpdir(), "sentinel-health-check.db");

await new Promise((resolve, reject) => {
  const proc = spawn(outputBin, [], {
    env: {
      ...process.env,
      PORT:               String(HEALTH_PORT),
      SENTINEL_DB_PATH:   HEALTH_DB,
      NODE_ENV:           "production",
      HOST:               "127.0.0.1",
    },
    cwd:   ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("error", (err) => {
    if (!settled) {
      settled = true;
      reject(new Error(`Sidecar process error: ${err.message}`));
    }
  });

  proc.on("exit", (code, signal) => {
    if (!settled) {
      settled = true;
      reject(
        new Error(
          `Sidecar exited unexpectedly (code=${code}, signal=${signal}).\n` +
          `  stdout: ${stdout.slice(-800)}\n` +
          `  stderr: ${stderr.slice(-800)}`
        )
      );
    }
  });

  // Poll /api/healthz up to 30 seconds
  const POLL_MS    = 750;
  const MAX_POLLS  = 40;
  let   polls      = 0;

  const poll = async () => {
    polls++;
    try {
      const resp = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/healthz`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!resp.ok) {
        proc.kill("SIGTERM");
        settled = true;
        reject(new Error(`Health check returned HTTP ${resp.status} — expected 200`));
        return;
      }

      const body = await resp.text().catch(() => "");
      settled = true;
      proc.kill("SIGTERM");
      resolve(body);
    } catch {
      // Not ready yet
      if (polls >= MAX_POLLS) {
        proc.kill("SIGTERM");
        settled = true;
        reject(
          new Error(
            `Server did not respond on port ${HEALTH_PORT} after ${(POLL_MS * MAX_POLLS) / 1000}s.\n` +
            `  stdout: ${stdout.slice(-800)}\n` +
            `  stderr: ${stderr.slice(-800)}\n\n` +
            "       Possible causes:\n" +
            "         • macOS blocked the extracted @libsql/darwin-arm64.node file (Gatekeeper)\n" +
            `           Fix: xattr -cr "${outputBin}" and rebuild\n` +
            "         • Native module extraction failed: check stderr above\n" +
            "         • Port 38099 is in use: lsof -i :38099"
          )
        );
      } else {
        setTimeout(poll, POLL_MS);
      }
    }
  };

  setTimeout(poll, POLL_MS);
});

console.log(`  ✓ GET http://127.0.0.1:${HEALTH_PORT}/api/healthz → 200`);
// Clean up temp DB
try { rmSync(HEALTH_DB, { force: true }); } catch { /* ignore */ }

// ── Done ──────────────────────────────────────────────────────────────────────
console.log(`
✅  Sidecar build complete
    Binary  : ${outputBin}
    Size    : ${(statSync(outputBin).size / (1024 * 1024)).toFixed(0)} MB
    Packager: @yao-pkg/pkg  (node22-macos-arm64)

Next steps:
    pnpm desktop:check     — verify full environment
    pnpm desktop:build     — build Sentinel.app + .dmg
`);
