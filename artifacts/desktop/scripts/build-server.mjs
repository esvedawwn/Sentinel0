/**
 * Builds the API server as a standalone Node.js SEA sidecar for Tauri bundling.
 *
 * WHY we download an official Node.js binary instead of using process.execPath:
 *   Homebrew's node@22 build strips the SEA fuse marker
 *   (NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2) that postject requires.
 *   Only official builds from nodejs.org embed this marker.  We download the
 *   official arm64 tarball once, cache it in os.tmpdir(), and use THAT binary
 *   as the injection base — regardless of what Node.js the user has installed.
 *
 * Steps:
 *   0. Remove any stale sidecar binary so a failed build never ships an old artifact
 *   1. Download / use cached official Node.js arm64 (pinned version)
 *   2. Preflight: verify SEA fuse marker is present in the official binary
 *   3. Bundle the Express server with esbuild → dist-sea/index.cjs
 *   4. Generate the SEA blob (node --experimental-sea-config)
 *   5. Copy the official binary, strip its signature, inject the blob with postject
 *   6. Treat postject non-zero exit as FATAL — never copy an invalid binary
 *   7. Post-injection: verify fuse marker is still present in the output binary
 *   8. Re-sign with an ad-hoc codesign signature
 *   9. Copy to src-tauri/binaries/ with the correct Rust target-triple suffix
 *  10. Smoke test: run the sidecar with SENTINEL_SMOKE_TEST=1 and require exit 0
 *
 * Requirements: Rust, curl, tar, codesign (macOS), pnpm
 *
 * Pinned runtime:  Node.js v22.16.0 darwin-arm64 (nodejs.org official build)
 *   Update SEA_NODE_VERSION to upgrade the sidecar runtime.
 *
 * Usage:  pnpm --filter @workspace/desktop run build:server
 *         (or via root alias: pnpm desktop:build:server)
 */

import { execSync, spawnSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..", "..", "..");
const API_DIR   = join(ROOT, "artifacts", "api-server");
const DESKTOP   = join(__dirname, "..");
const BIN_DIR   = join(DESKTOP, "src-tauri", "binaries");
const DIST_SEA  = join(API_DIR, "dist-sea");

// ── Pinned Node.js runtime ────────────────────────────────────────────────────
// Source: https://nodejs.org/dist/  (official builds — NOT Homebrew)
// Homebrew strips the SEA fuse marker; always use nodejs.org builds here.
// Update this constant when upgrading the sidecar runtime.
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
  fatal(
    "This build script targets macOS (darwin) only.\n" +
    "       Linux / Windows support requires a separate download URL and binary name."
  );
}
if (os.arch() !== "arm64") {
  fatal(
    "This script targets Apple Silicon (arm64).\n" +
    `       Detected: ${os.arch()}.  For Intel Macs, set SEA_NODE_ARCH=darwin-x64 and\n` +
    "       update SEA_NODE_VERSION / download URL accordingly."
  );
}

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
console.log(`  Rust target  : ${rustTarget}`);
console.log(`  Node runtime : v${SEA_NODE_VERSION} ${SEA_NODE_ARCH} (official build)`);
console.log(`  Output       : src-tauri/binaries/server-${rustTarget}`);

const outputBin = join(BIN_DIR, `server-${rustTarget}`);

// ── Step 0: Remove stale sidecar ─────────────────────────────────────────────
step(0, 10, "Removing stale sidecar (if any)");
if (existsSync(outputBin)) {
  rmSync(outputBin);
  console.log(`  Removed: ${outputBin}`);
} else {
  console.log("  Nothing to remove");
}

// ── Step 1: Download / verify cached official Node.js binary ─────────────────
step(1, 10, `Fetching official Node.js v${SEA_NODE_VERSION} ${SEA_NODE_ARCH}`);

if (existsSync(SEA_NODE_BIN)) {
  console.log(`  Using cache: ${SEA_NODE_BIN}`);
} else {
  const tarName = `node-v${SEA_NODE_VERSION}-${SEA_NODE_ARCH}.tar.gz`;
  const tarUrl  = `https://nodejs.org/dist/v${SEA_NODE_VERSION}/${tarName}`;
  const tarPath = join(os.tmpdir(), tarName);

  console.log(`  Downloading: ${tarUrl}`);
  mkdirSync(SEA_NODE_CACHE, { recursive: true });

  try {
    execSync(
      `curl -L --fail --progress-bar --retry 3 --retry-delay 2 -o "${tarPath}" "${tarUrl}"`,
      { stdio: "inherit" }
    );
  } catch {
    fatal(
      `Download failed for Node.js v${SEA_NODE_VERSION}.\n` +
      `       URL: ${tarUrl}\n` +
      `       If that version no longer exists, update SEA_NODE_VERSION in\n` +
      `       artifacts/desktop/scripts/build-server.mjs and retry.\n` +
      `       Available versions: https://nodejs.org/dist/`
    );
  }

  execSync(`tar xzf "${tarPath}" -C "${SEA_NODE_CACHE}"`, { stdio: "inherit" });

  if (!existsSync(SEA_NODE_BIN)) {
    fatal(
      `Expected binary not found after extraction: ${SEA_NODE_BIN}\n` +
      `       The tarball may have a different internal layout.`
    );
  }
  console.log(`  Cached at: ${SEA_NODE_BIN}`);
}

// Verify architecture of downloaded binary
const fileOut = execSync(`file "${SEA_NODE_BIN}"`, { encoding: "utf8" }).trim();
if (!fileOut.includes("arm64")) {
  fatal(
    `Downloaded binary does not appear to be arm64:\n       ${fileOut}\n` +
    `       Delete the cache and retry: rm -rf "${SEA_NODE_CACHE}"`
  );
}
console.log(`  Arch confirmed: ${fileOut.split(":")[1]?.trim()}`);

// ── Step 2: Preflight — SEA fuse marker check ─────────────────────────────────
step(2, 10, "Preflight: verifying SEA fuse marker in official binary");
{
  const binBytes = readFileSync(SEA_NODE_BIN);
  if (binBytes.indexOf(Buffer.from(SEA_FUSE)) === -1) {
    fatal(
      `SEA fuse marker not found in ${SEA_NODE_BIN}.\n` +
      `       This should not happen with an official nodejs.org build.\n` +
      `       Delete the cache and retry: rm -rf "${SEA_NODE_CACHE}"`
    );
  }
  console.log(`  ✓ ${SEA_FUSE}`);
}

// ── Step 3: Bundle API server ─────────────────────────────────────────────────
step(3, 10, "Bundling API server with esbuild (format=cjs, outdir=dist-sea)");
execSync(`node ./build.mjs --format=cjs --outdir=dist-sea`, {
  cwd: API_DIR,
  stdio: "inherit",
});

const seaMainCjs = join(DIST_SEA, "index.cjs");
if (!existsSync(seaMainCjs)) {
  fatal(
    `Expected SEA entry not found after build: ${seaMainCjs}\n` +
    `       Verify that artifacts/api-server/src/index.ts is the esbuild entry point.`
  );
}
const cjsFiles = readdirSync(DIST_SEA).filter((f) => f.endsWith(".cjs")).sort();
console.log("  Generated CJS files:");
cjsFiles.forEach((f) => console.log(`    ${f}`));

// ── Step 4: Generate SEA blob ─────────────────────────────────────────────────
step(4, 10, "Generating SEA blob");
const blobPath = join(DIST_SEA, "sea-prep.blob");
const seaConfigPath = join(DIST_SEA, "sea-config.json");
writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main:                          seaMainCjs,
      output:                        blobPath,
      disableExperimentalSEAWarning: true,
    },
    null,
    2
  )
);

execSync(`node --experimental-sea-config dist-sea/sea-config.json`, {
  cwd: API_DIR,
  stdio: "inherit",
});

if (!existsSync(blobPath)) fatal(`SEA blob not created: ${blobPath}`);
const blobSizeKB = Math.round(statSync(blobPath).size / 1024);
console.log(`  ✓ Blob: ${blobPath} (${blobSizeKB} KB)`);

// ── Step 5: Copy official binary → tmp, strip signature ──────────────────────
step(5, 10, "Preparing injection base (copy + strip codesign)");
const tmpBin = join(os.tmpdir(), "sentinel-sea-inject-tmp");

copyFileSync(SEA_NODE_BIN, tmpBin);
execSync(`chmod 755 "${tmpBin}"`);
execSync(`codesign --remove-signature "${tmpBin}"`, { stdio: "inherit" });
console.log(`  Injection base: ${tmpBin}`);

// ── Step 6: Inject blob with postject — fatal on non-zero exit ────────────────
step(6, 10, "Injecting SEA blob with postject");
const postjectResult = spawnSync(
  "npx",
  [
    "--yes", "postject",
    tmpBin,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse", SEA_FUSE,
    "--macho-segment-name", "__NODE_SEA",
  ],
  { encoding: "utf8", stdio: "inherit" }
);

if (postjectResult.error) {
  fatal(`postject could not be launched: ${postjectResult.error.message}`);
}
if (postjectResult.status !== 0) {
  // Clean up the tmp file so there is no chance of an invalid binary being
  // picked up by a subsequent step.
  try { rmSync(tmpBin); } catch { /* ignore */ }
  fatal(
    `postject exited with code ${postjectResult.status}.\n` +
    `       The SEA blob was NOT injected.  No sidecar was produced.\n` +
    `       Common causes:\n` +
    `         • Node.js binary lacks the SEA fuse (should not happen with the\n` +
    `           official binary — delete the cache and retry).\n` +
    `         • Binary is still code-signed (codesign --remove-signature failed).\n` +
    `         • postject version incompatible with Node.js v${SEA_NODE_VERSION}.`
  );
}
console.log("  ✓ postject exited 0");

// ── Step 7: Post-injection verification ──────────────────────────────────────
step(7, 10, "Verifying injection (fuse present in output binary)");
{
  const injected = readFileSync(tmpBin);
  if (injected.indexOf(Buffer.from(SEA_FUSE)) === -1) {
    try { rmSync(tmpBin); } catch { /* ignore */ }
    fatal(
      "Post-injection check failed: SEA fuse marker not found in the output binary.\n" +
      "       Injection may have silently corrupted the binary.\n" +
      "       Delete the cache and retry: rm -rf \"${SEA_NODE_CACHE}\""
    );
  }
  const sizeKB = Math.round(statSync(tmpBin).size / 1024);
  if (sizeKB < 5_000) {
    fatal(
      `Output binary is suspiciously small (${sizeKB} KB — expected > 5 000 KB).\n` +
      "       The blob may not have been injected correctly."
    );
  }
  console.log(`  ✓ Fuse marker confirmed in output binary (size: ${sizeKB} KB)`);
}

// ── Step 8: Re-sign with ad-hoc signature ────────────────────────────────────
step(8, 10, "Re-signing with ad-hoc codesign");
execSync(`codesign --sign - "${tmpBin}"`, { stdio: "inherit" });
console.log("  ✓ Ad-hoc codesign applied");

// ── Step 9: Install sidecar ───────────────────────────────────────────────────
step(9, 10, `Installing sidecar → ${outputBin}`);
mkdirSync(BIN_DIR, { recursive: true });
copyFileSync(tmpBin, outputBin);
execSync(`chmod +x "${outputBin}"`);
console.log(`  ✓ ${outputBin}`);

// ── Step 10: Smoke test ───────────────────────────────────────────────────────
// SENTINEL_SMOKE_TEST=1 triggers an early-exit banner injected by build.mjs into
// the CJS bundle, which runs BEFORE any external require() (including @libsql).
// This proves the SEA binary executes without crashing.
step(10, 10, "Smoke test (SENTINEL_SMOKE_TEST=1)");
const smokeResult = spawnSync(outputBin, [], {
  env:      { ...process.env, SENTINEL_SMOKE_TEST: "1" },
  encoding: "utf8",
  timeout:  15_000,
  cwd:      ROOT,
});

if (smokeResult.error) {
  fatal(
    `Smoke test could not launch: ${smokeResult.error.message}\n` +
    `       Binary: ${outputBin}`
  );
}
if (smokeResult.status !== 0) {
  fatal(
    `Smoke test exited with code ${smokeResult.status}.\n` +
    `  stdout: ${smokeResult.stdout?.trim()}\n` +
    `  stderr: ${smokeResult.stderr?.trim()}`
  );
}
const smokeOut = (smokeResult.stdout ?? "").trim();
if (!smokeOut.includes("sentinel-sea-smoke-test: ok")) {
  fatal(
    `Smoke test did not print expected output.\n` +
    `  Expected: "sentinel-sea-smoke-test: ok"\n` +
    `  Got:      "${smokeOut}"`
  );
}
console.log(`  ✓ ${smokeOut}`);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log(`
✅  Sidecar build complete
    Binary : ${outputBin}
    Runtime: Node.js v${SEA_NODE_VERSION} ${SEA_NODE_ARCH} (nodejs.org official)

Next steps:
    pnpm desktop:check          — verify full environment
    pnpm desktop:build          — build Sentinel.app + .dmg
`);
