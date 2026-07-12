/**
 * desktop:check — verifies the local environment is ready to build Sentinel.app
 *
 * Usage:  pnpm desktop:check
 *         node artifacts/desktop/scripts/check-desktop-env.mjs
 */

import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";
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
    pass(`server-${rustTarget} found`);
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
