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
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
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

// ── 2. Bundle API server with esbuild (CJS, single file) ────────────────────
console.log("Bundling API server...");
mkdirSync(join(API_DIR, "dist-sea"), { recursive: true });

execSync(
  `node ./build.mjs --format=cjs --outfile=dist-sea/server.cjs`,
  { cwd: API_DIR, stdio: "inherit" }
);

// ── 3. Create SEA config ─────────────────────────────────────────────────────
const seaConfig = {
  main: join(API_DIR, "dist-sea", "server.cjs"),
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
const tmpBin = join(API_DIR, "dist-sea", `server-tmp${os.platform() === "win32" ? ".exe" : ""}`);

copyFileSync(nodeExec, tmpBin);

// Remove existing signature on macOS
if (os.platform() === "darwin") {
  spawnSync("codesign", ["--remove-signature", tmpBin]);
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
