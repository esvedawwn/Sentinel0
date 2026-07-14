/**
 * desktop:check — verifies the local environment is ready to build Sentinel.app
 *
 * Usage:  pnpm desktop:check
 *         node artifacts/desktop/scripts/check-desktop-env.mjs
 */

import { execSync, spawnSync, spawn } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DESKTOP = join(ROOT, "artifacts", "desktop");
const ICONS   = join(DESKTOP, "src-tauri", "icons");
const API_DIR = join(ROOT, "artifacts", "api-server");
const DIST_SEA = join(API_DIR, "dist-sea");

let ok = true;

function pass(msg)    { console.log(`  ✓  ${msg}`); }
function fail(msg)    { console.error(`  ✗  ${msg}`); ok = false; }
function info(msg)    { console.log(`  ·  ${msg}`); }
function warn(msg)    { console.log(`  ⚠  ${msg}`); }
function section(title) { console.log(`\n── ${title} ──`); }

// ── Platform ─────────────────────────────────────────────────────────────────
section("Platform");
const platform = os.platform();
const arch     = os.arch();
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
if (major >= 18) {
  pass(`Node.js ${nodeVersion}`);
} else {
  fail(`Node.js ${nodeVersion} — upgrade to 18+ to run pnpm scripts`);
}
// @yao-pkg/pkg downloads its own Node.js 22 runtime; any distribution works here.
info(`Node.js binary: ${process.execPath}`);

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
  const v = execSync("pnpm --filter @workspace/desktop exec tauri --version", {
    cwd: ROOT, encoding: "utf8",
  }).trim();
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

// ── Desktop sidecar build artifacts ──────────────────────────────────────────
// The sidecar pipeline uses @yao-pkg/pkg:
//   esbuild → dist-sea/index.cjs  (+pino workers)
//   @yao-pkg/pkg → src-tauri/binaries/server-<rust-target>
// No sea-prep.blob or postject artefacts are created.
section("Desktop sidecar build artifacts (artifacts/api-server/dist-sea/)");

// index.cjs — main CJS bundle (pkg entry point)
const indexCjs = join(DIST_SEA, "index.cjs");
if (existsSync(indexCjs)) {
  const sizeMB = statSync(indexCjs).size / (1024 * 1024);
  pass(`index.cjs (${sizeMB.toFixed(1)} MB) — pkg entry point`);
} else {
  fail("index.cjs not found — run: pnpm desktop:build:server");
}

// pkg-config.json — pkg configuration (scripts + assets)
const pkgConfig = join(API_DIR, "pkg-config.json");
if (existsSync(pkgConfig)) {
  try {
    const cfg = JSON.parse(readFileSync(pkgConfig, "utf8"));
    const scriptCount = cfg.scripts?.length ?? 0;
    const assetCount  = cfg.assets?.length  ?? 0;
    pass(`pkg-config.json (${scriptCount} scripts, ${assetCount} assets)`);
  } catch {
    warn("pkg-config.json exists but could not be parsed as JSON");
  }
} else {
  info("pkg-config.json not found (created during build — run: pnpm desktop:build:server)");
}

// Pino worker files — generated by esbuild-plugin-pino; needed by pkg scripts list.
// Not required at sidecar runtime (NODE_ENV=production disables pino-pretty transport).
const pinoWorkers = ["pino-worker.cjs", "thread-stream-worker.cjs", "pino-file.cjs", "pino-pretty.cjs"];
const presentWorkers = pinoWorkers.filter((f) => existsSync(join(DIST_SEA, f)));
if (presentWorkers.length > 0) {
  info(`Pino worker files present in dist-sea/ (${presentWorkers.length}/${pinoWorkers.length}): ${presentWorkers.join(", ")}`);
} else {
  info("Pino worker files not yet built (run: pnpm desktop:build:server)");
}

// ── @yao-pkg/pkg Node.js runtime cache ───────────────────────────────────────
section("@yao-pkg/pkg Node.js runtime cache (~/.pkg-cache)");
const pkgCacheDir = join(os.homedir(), ".pkg-cache");
if (existsSync(pkgCacheDir)) {
  try {
    const entries  = readdirSync(pkgCacheDir);
    const node22   = entries.filter((e) => /node22|v22/.test(e));
    if (node22.length > 0) {
      pass(`pkg cache: Node.js 22 runtime cached (${node22.join(", ")})`);
    } else {
      info(
        "pkg cache exists but no Node.js 22 runtime found — first run of\n" +
        "       pnpm desktop:build:server will download it (~70 MB)."
      );
    }
  } catch {
    info(`pkg cache directory: ${pkgCacheDir}`);
  }
} else {
  info(
    "pkg cache not yet created (~/.pkg-cache) — first run of\n" +
    "       pnpm desktop:build:server will download the Node.js 22 runtime (~70 MB).\n" +
    "       Subsequent runs use the cache and are fast."
  );
}

// ── Server sidecar binary ─────────────────────────────────────────────────────
section("Server sidecar binary (compiled by @yao-pkg/pkg)");
const binariesDir = join(DESKTOP, "src-tauri", "binaries");

let rustTarget = null;
try {
  rustTarget = execSync("rustc -vV", { encoding: "utf8" }).match(/host: (\S+)/)?.[1] ?? null;
} catch { /* Rust not installed */ }

let serverBin = null;

if (rustTarget) {
  serverBin = join(binariesDir, `server-${rustTarget}`);
  if (existsSync(serverBin)) {
    // A valid @yao-pkg/pkg binary includes the full Node.js runtime — must be > 30 MB.
    const sizeMB = statSync(serverBin).size / (1024 * 1024);
    if (sizeMB < 30) {
      fail(
        `server-${rustTarget} is suspiciously small (${sizeMB.toFixed(1)} MB — expected > 30 MB).\n` +
        "       This may be an old SEA artefact or a failed pkg build.\n" +
        "       Run: pnpm desktop:build:server  to rebuild."
      );
      serverBin = null; // skip further binary checks
    } else {
      pass(`server-${rustTarget} (${sizeMB.toFixed(0)} MB)`);
    }

    // Verify Mach-O arm64
    if (serverBin) {
      try {
        const fileOut = execSync(`file "${serverBin}"`, { encoding: "utf8" }).trim();
        if (fileOut.includes("arm64") || fileOut.includes("Mach-O")) {
          pass(`Binary format: ${fileOut.split(":")[1]?.trim()}`);
        } else {
          fail(`Unexpected binary format: ${fileOut}`);
          serverBin = null;
        }
      } catch {
        info("Could not run `file` to verify binary format");
      }
    }
  } else {
    fail(`server-${rustTarget} not found — run: pnpm desktop:build:server`);
    serverBin = null;
  }
} else {
  info("Cannot check server binary — Rust not installed yet");
}

// ── Smoke test ────────────────────────────────────────────────────────────────
// Fires before any require() call in the bundle — proves the binary executes
// without loading any native module (.node file).
section("Sidecar smoke test (SENTINEL_SMOKE_TEST=1)");
if (serverBin) {
  const smoke = spawnSync(serverBin, [], {
    env:      { ...process.env, SENTINEL_SMOKE_TEST: "1" },
    encoding: "utf8",
    timeout:  15_000,
    cwd:      ROOT,
  });
  if (smoke.error) {
    fail(
      `Smoke test could not launch binary: ${smoke.error.message}\n` +
      "       Possible cause: macOS Gatekeeper blocked the unsigned binary.\n" +
      `       Try: xattr -cr "${serverBin}" then re-run.`
    );
  } else if (smoke.status !== 0) {
    fail(
      `Smoke test exited ${smoke.status}.\n` +
      `  stdout: ${smoke.stdout?.trim()}\n` +
      `  stderr: ${smoke.stderr?.trim()}`
    );
  } else if (!(smoke.stdout ?? "").includes("sentinel-sidecar-smoke-test: ok")) {
    fail(
      `Smoke test exited 0 but output did not contain expected string.\n` +
      `  Expected: "sentinel-sidecar-smoke-test: ok"\n` +
      `  Got:      "${(smoke.stdout ?? "").trim()}"`
    );
  } else {
    pass(`Smoke test passed — ${(smoke.stdout ?? "").trim()}`);
  }
} else {
  info("Skipping smoke test — binary not available");
}

// ── Health check (optional) ───────────────────────────────────────────────────
// Starts the sidecar, polls /api/healthz, verifies HTTP 200, then shuts down.
// This is the first check that exercises the native @libsql/darwin-arm64.node.
section("Sidecar health check — GET /api/healthz (optional)");
if (serverBin) {
  const HEALTH_PORT = 38098;
  const HEALTH_DB   = join(os.tmpdir(), `sentinel-check-${process.pid}.db`);

  await new Promise((resolve) => {
    const proc = spawn(serverBin, [], {
      env: {
        ...process.env,
        PORT:             String(HEALTH_PORT),
        SENTINEL_DB_PATH: HEALTH_DB,
        NODE_ENV:         "production",
        HOST:             "127.0.0.1",
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
        fail(`Health check: could not launch sidecar — ${err.message}`);
        resolve();
      }
    });

    proc.on("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        fail(
          `Health check: sidecar exited unexpectedly (code=${code}, signal=${signal}).\n` +
          `  stdout: ${stdout.slice(-500)}\n` +
          `  stderr: ${stderr.slice(-500)}`
        );
        resolve();
      }
    });

    const POLL_MS   = 700;
    const MAX_POLLS = 40;
    let   polls     = 0;

    const poll = async () => {
      polls++;
      try {
        const resp = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/healthz`, {
          signal: AbortSignal.timeout(2000),
        });
        settled = true;
        proc.kill("SIGTERM");
        if (resp.ok) {
          pass(`GET /api/healthz → ${resp.status} (native @libsql/darwin-arm64.node loaded ✓)`);
        } else {
          fail(`GET /api/healthz → ${resp.status} — expected 200`);
        }
        resolve();
      } catch {
        if (polls >= MAX_POLLS) {
          settled = true;
          proc.kill("SIGTERM");
          fail(
            `Health check: sidecar did not respond on port ${HEALTH_PORT} after ${(POLL_MS * MAX_POLLS) / 1000}s.\n` +
            `  stdout: ${stdout.slice(-500)}\n` +
            `  stderr: ${stderr.slice(-500)}\n` +
            "  Possible cause: macOS blocked @libsql/darwin-arm64.node.\n" +
            `  Fix: xattr -cr "${serverBin}" then re-run.`
          );
          resolve();
        } else {
          setTimeout(poll, POLL_MS);
        }
      }
    };

    setTimeout(poll, POLL_MS);
  });

  // Clean up temp DB
  try {
    const { rmSync } = await import("fs");
    rmSync(HEALTH_DB, { force: true });
  } catch { /* ignore */ }
} else {
  info("Skipping health check — binary not available");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("");
if (ok) {
  console.log("✅  Environment ready — run: pnpm desktop:build");
} else {
  console.log("❌  Fix the issues above, then re-run: pnpm desktop:check");
  process.exit(1);
}
