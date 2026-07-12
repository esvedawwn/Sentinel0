/**
 * desktop:check — verifies the local environment is ready to build Sentinel.app
 *
 * Usage:  pnpm desktop:check
 *         node artifacts/desktop/scripts/check-desktop-env.mjs
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DESKTOP = join(ROOT, "artifacts", "desktop");
const ICONS = join(DESKTOP, "src-tauri", "icons");

let ok = true;

function pass(msg) { console.log(`  ✓  ${msg}`); }
function fail(msg) { console.error(`  ✗  ${msg}`); ok = false; }
function info(msg) { console.log(`  ·  ${msg}`); }
function section(title) { console.log(`\n── ${title} ──`); }

// ── Platform ─────────────────────────────────────────────────────────────────
section("Platform");
const platform = os.platform();
const arch = os.arch();
info(`${platform} ${arch} (${os.release()})`);

if (platform !== "darwin") {
  fail("macOS required to produce Sentinel.app / .dmg");
} else {
  pass("macOS detected");
  if (arch === "arm64") pass("Apple Silicon (arm64)");
  else info("Intel Mac — builds will produce x64 binary");
}

// ── Node.js ──────────────────────────────────────────────────────────────────
section("Node.js");
const nodeVersion = process.version;
const [major] = nodeVersion.replace("v", "").split(".").map(Number);
if (major >= 21) {
  pass(`Node.js ${nodeVersion} (≥ 21 required for Node SEA)`);
} else {
  fail(`Node.js ${nodeVersion} — upgrade to 21+ for Node SEA (Single Executable Applications)`);
}

// Warn if running from Homebrew — Homebrew strips the SEA fuse marker.
// build-server.mjs downloads an official binary independently, so this is
// only a warning (the build will still succeed), but worth surfacing.
{
  const execPath = process.execPath;
  if (execPath.includes("/homebrew/") || execPath.includes("/Homebrew/")) {
    info(
      `Node.js via Homebrew detected (${execPath}).\n` +
      "     ·  Homebrew strips the SEA fuse — build-server.mjs downloads an\n" +
      "     ·  official nodejs.org binary automatically.  Build will still work."
    );
  } else {
    pass(`Node.js binary: ${execPath}`);
  }
}

// ── pnpm ─────────────────────────────────────────────────────────────────────
section("pnpm");
try {
  const v = execSync("pnpm --version", { encoding: "utf8" }).trim();
  pass(`pnpm ${v}`);
} catch {
  fail("pnpm not found — install with: corepack enable pnpm");
}

// ── Rust / Cargo ──────────────────────────────────────────────────────────────
section("Rust toolchain");
try {
  const rustc = execSync("rustc --version", { encoding: "utf8" }).trim();
  pass(rustc);
} catch {
  fail("rustc not found — install Rust: https://rustup.rs");
}
try {
  const cargo = execSync("cargo --version", { encoding: "utf8" }).trim();
  pass(cargo);
} catch {
  fail("cargo not found — install Rust: https://rustup.rs");
}

// Verify Apple Silicon target is registered
try {
  const targets = execSync("rustup target list --installed", { encoding: "utf8" });
  if (targets.includes("aarch64-apple-darwin")) {
    pass("rustup target aarch64-apple-darwin installed");
  } else {
    fail("Apple Silicon target missing — run: rustup target add aarch64-apple-darwin");
  }
} catch {
  info("rustup not found — skipping target check");
}

// ── Xcode CLI tools ───────────────────────────────────────────────────────────
section("Xcode command-line tools");
if (platform === "darwin") {
  const r = spawnSync("xcode-select", ["--print-path"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) {
    pass(`Xcode CLT at ${r.stdout.trim()}`);
  } else {
    fail("Xcode command-line tools missing — run: xcode-select --install");
  }
}

// ── Tauri CLI ─────────────────────────────────────────────────────────────────
section("Tauri CLI");
try {
  const v = execSync("pnpm --filter @workspace/desktop exec tauri --version", { cwd: ROOT, encoding: "utf8" }).trim();
  pass(`Tauri CLI ${v}`);
} catch {
  fail("Tauri CLI not found — run: pnpm install");
}

// ── Icons ─────────────────────────────────────────────────────────────────────
section("Icons");
const requiredIcons = [
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.icns",
  "icon.ico",
];
for (const icon of requiredIcons) {
  const p = join(ICONS, icon);
  if (existsSync(p)) pass(icon);
  else fail(`${icon} missing — run: pnpm desktop:icons`);
}

// ── SEA build artifacts ───────────────────────────────────────────────────────
section("SEA build artifacts (artifacts/api-server/dist-sea/)");
const API_DIR = join(ROOT, "artifacts", "api-server");
const distSea = join(API_DIR, "dist-sea");

// index.cjs — main bundle (SEA main entry point)
const indexCjs = join(distSea, "index.cjs");
if (existsSync(indexCjs)) {
  pass("index.cjs found (SEA main entry)");
} else {
  fail("index.cjs not found — run: pnpm desktop:build:server");
}

// sea-prep.blob — SEA payload
const blobFile = join(distSea, "sea-prep.blob");
if (existsSync(blobFile)) {
  pass("sea-prep.blob found");
} else {
  fail("sea-prep.blob not found — run: pnpm desktop:build:server");
}

// Pino worker files (generated by esbuild-plugin-pino; logged for reference)
// These do NOT need to be co-located with the sidecar binary at runtime because
// the sidecar is spawned with NODE_ENV=production, which disables the pino-pretty
// transport in logger.ts — pino never spawns worker threads in production mode.
const pinoWorkers = ["pino-worker.cjs", "thread-stream-worker.cjs", "pino-file.cjs", "pino-pretty.cjs"];
const presentWorkers = pinoWorkers.filter((f) => existsSync(join(distSea, f)));
if (presentWorkers.length > 0) {
  info(`Pino worker files in dist-sea/ (not bundled into app — not needed at runtime):`);
  presentWorkers.forEach((f) => info(`  ${f}`));
} else {
  info("Pino worker files not yet built (run pnpm desktop:build:server to generate them)");
}

// ── Cached official Node.js binary (for SEA injection) ───────────────────────
section("Cached official Node.js binary (nodejs.org, for SEA injection)");
const SEA_NODE_VERSION = "22.16.0";
const SEA_NODE_ARCH    = "darwin-arm64";
const SEA_NODE_CACHE   = join(
  os.tmpdir(),
  `sentinel-sea-node-v${SEA_NODE_VERSION}-${SEA_NODE_ARCH}`
);
const SEA_NODE_BIN = join(
  SEA_NODE_CACHE,
  `node-v${SEA_NODE_VERSION}-${SEA_NODE_ARCH}`,
  "bin",
  "node"
);
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

if (existsSync(SEA_NODE_BIN)) {
  pass(`Cached at ${SEA_NODE_BIN}`);
  // Verify fuse marker in cached binary
  try {
    const binBytes = readFileSync(SEA_NODE_BIN);
    if (binBytes.indexOf(Buffer.from(SEA_FUSE)) !== -1) {
      pass("SEA fuse marker present in cached binary");
    } else {
      fail(
        `SEA fuse marker missing from cached binary — delete cache and retry:\n` +
        `       rm -rf "${SEA_NODE_CACHE}"`
      );
    }
  } catch {
    info("Could not read cached binary for fuse check");
  }
} else {
  info(
    `Not yet downloaded — will be fetched automatically by pnpm desktop:build:server\n` +
    `       (Node.js v${SEA_NODE_VERSION} ${SEA_NODE_ARCH} from nodejs.org)`
  );
}

// ── Server binary ─────────────────────────────────────────────────────────────
section("Server sidecar binary");
const binariesDir = join(DESKTOP, "src-tauri", "binaries");

let rustTarget = null;
try {
  rustTarget = execSync("rustc -vV", { encoding: "utf8" }).match(/host: (\S+)/)?.[1] ?? null;
} catch { /* Rust not installed */ }

if (rustTarget) {
  const serverBin = join(binariesDir, `server-${rustTarget}`);
  if (existsSync(serverBin)) {
    // Check binary has a plausible size (a valid SEA binary is > 5 MB)
    const sizeMB = statSync(serverBin).size / (1024 * 1024);
    if (sizeMB < 5) {
      fail(
        `server-${rustTarget} exists but is suspiciously small (${sizeMB.toFixed(1)} MB).\n` +
        "       It may be an incomplete or invalid SEA binary.\n" +
        "       Run:  pnpm desktop:build:server  to rebuild."
      );
    } else {
      pass(`server-${rustTarget} (${sizeMB.toFixed(0)} MB)`);
    }
    // Check SEA fuse is in the sidecar
    try {
      const binBytes = _readFileSync(serverBin);
      if (binBytes.indexOf(Buffer.from(SEA_FUSE)) !== -1) {
        pass("SEA fuse marker present in sidecar binary");
      } else {
        fail(
          `SEA fuse marker missing from sidecar binary — the blob may not\n` +
          "       have been injected correctly.\n" +
          "       Run:  pnpm desktop:build:server  to rebuild."
        );
      }
    } catch {
      info("Could not read sidecar binary for fuse check");
    }
  } else {
    fail(`server-${rustTarget} not found — run: pnpm desktop:build:server`);
  }
} else {
  info("Cannot check server binary — Rust not installed yet");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("");
if (ok) {
  console.log("✅  Environment ready — run: pnpm desktop:package");
} else {
  console.log("❌  Fix the issues above, then re-run: pnpm desktop:check");
  process.exit(1);
}
