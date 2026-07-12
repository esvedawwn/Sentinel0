/**
 * Builds the API server as a standalone binary for Tauri bundling.
 *
 * Steps:
 *  1. Bundles the Express server with esbuild → single CJS file
 *  2. Creates a Node.js SEA (Single Executable Application) blob
 *  3. Injects the blob into a Node.js binary copy
 *  4. Places the result in src-tauri/binaries/ with the correct platform suffix
 *
 * Requirements: Node.js 21+, postject (installed automatically)
 *
 * Usage:  pnpm --filter @workspace/desktop run build:server
 */

import { execSync, spawnSync } from "child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const API_DIR = join(ROOT, "artifacts", "api-server");
const BINARIES_DIR = join(__dirname, "..", "src-tauri", "binaries");

// ── 1. Get Rust target triple for binary naming ──────────────────────────────
const rustTarget = execSync("rustc -vV")
  .toString()
  .match(/host: (\S+)/)?.[1];

if (!rustTarget) {
  console.error("Could not determine Rust target triple. Is Rust installed?");
  process.exit(1);
}

console.log(`Building server for target: ${rustTarget}`);

const outputBin = join(BINARIES_DIR, `server-${rustTarget}${os.platform() === "win32" ? ".exe" : ""}`);

// ── 2. Bundle API server with esbuild (CJS, multi-output via --outdir) ───────
//
// esbuild-plugin-pino generates multiple worker entry points in addition to the
// main bundle, so --outfile cannot be used.  --outdir=dist-sea is required.
// The plugin produces (all in dist-sea/):
//   index.cjs              ← main bundle, used as the SEA main
//   pino-worker.cjs
//   thread-stream-worker.cjs
//   pino-file.cjs
//   pino-pretty.cjs
//
// At runtime the sidecar is spawned with NODE_ENV=production (see lib.rs),
// which disables the pino-pretty transport in logger.ts.  Pino therefore never
// spawns worker threads, so the worker .cjs files do NOT need to be co-located
// with the sidecar binary in the Tauri bundle.  They are preserved in dist-sea/
// for reference and potential future use, but are NOT copied to src-tauri/.
//
// build.mjs handles cleaning dist-sea/ before building.
console.log("Bundling API server with esbuild (outdir=dist-sea)...");

execSync(
  `node ./build.mjs --format=cjs --outdir=dist-sea`,
  { cwd: API_DIR, stdio: "inherit" }
);

// Verify that the expected main entry point was generated.
const seaMainCjs = join(API_DIR, "dist-sea", "index.cjs");
if (!existsSync(seaMainCjs)) {
  console.error(
    `\nERROR: Expected SEA main was not generated: ${seaMainCjs}\n` +
    "       Ensure artifacts/api-server/src/index.ts is the esbuild entry point\n" +
    "       and that build.mjs uses --outdir=dist-sea.\n"
  );
  process.exit(1);
}

// Log all generated CJS files for confirmation.
const generatedFiles = readdirSync(join(API_DIR, "dist-sea"))
  .filter((f) => f.endsWith(".cjs"))
  .sort();
console.log("Generated CJS files in dist-sea/:");
generatedFiles.forEach((f) => console.log("  " + f));

// ── 3. Create SEA config ─────────────────────────────────────────────────────
const seaConfig = {
  main: join(API_DIR, "dist-sea", "index.cjs"),
  output: join(API_DIR, "dist-sea", "sea-prep.blob"),
  disableExperimentalSEAWarning: true,
};

writeFileSync(
  join(API_DIR, "dist-sea", "sea-config.json"),
  JSON.stringify(seaConfig, null, 2)
);

console.log("Generating SEA blob...");
execSync(
  `node --experimental-sea-config dist-sea/sea-config.json`,
  { cwd: API_DIR, stdio: "inherit" }
);

// ── 4. Copy Node.js binary and inject blob ───────────────────────────────────
const nodeExec = process.execPath;

// Use os.tmpdir() so we are never fighting permissions on the source binary's
// original install location (Homebrew, NVM, etc. can make it read-only or signed
// in a way that postject cannot overwrite even after chmod).
const tmpBin = join(os.tmpdir(), `sentinel-server-tmp${os.platform() === "win32" ? ".exe" : ""}`);

copyFileSync(nodeExec, tmpBin);

// Ensure the copy is fully writable+executable before injection.
if (os.platform() !== "win32") {
  execSync(`chmod 755 "${tmpBin}"`);
}

// Remove existing signature on macOS — use execSync (not spawnSync) so that a
// failure is not silently swallowed; an un-removed signature will cause postject
// to fail with "Can't read and write to target executable".
if (os.platform() === "darwin") {
  execSync(`codesign --remove-signature "${tmpBin}"`);
}

// Install postject if needed
try {
  execSync("npx --yes postject --help", { stdio: "ignore" });
} catch {
  execSync("npm install -g postject", { stdio: "inherit" });
}

console.log("Injecting blob into Node.js binary...");
const postjectArgs = [
  tmpBin,
  "NODE_SEA_BLOB",
  join(API_DIR, "dist-sea", "sea-prep.blob"),
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(os.platform() === "darwin" ? ["--macho-segment-name", "__NODE_SEA"] : []),
];
execSync(`npx postject ${postjectArgs.join(" ")}`, { stdio: "inherit" });

// Re-sign on macOS
if (os.platform() === "darwin") {
  spawnSync("codesign", ["--sign", "-", tmpBin]);
}

// ── 5. Place in binaries/ ────────────────────────────────────────────────────
mkdirSync(BINARIES_DIR, { recursive: true });
copyFileSync(tmpBin, outputBin);

if (os.platform() !== "win32") {
  execSync(`chmod +x ${outputBin}`);
}

console.log(`\n✓ Server binary ready: ${outputBin}`);
console.log("\nNext step:  pnpm --filter @workspace/desktop run build");
