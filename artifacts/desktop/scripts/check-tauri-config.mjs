/**
 * check-tauri-config.mjs — validates Tauri configuration files before build.
 *
 * Fails with exit code 1 if any Tauri config file contains the `"all"` field
 * under `plugins.shell`.  In Tauri v2 the shell plugin config only accepts
 * `"open"`.  The `"all"` field is a Tauri v1 artefact that causes an immediate
 * startup panic:
 *
 *   PluginInitialization("shell", "Error deserializing 'plugins.shell' within
 *   your Tauri configuration: unknown field `all`, expected `open`")
 *
 * Usage:
 *   node artifacts/desktop/scripts/check-tauri-config.mjs
 *
 * Exit codes:
 *   0 — all configs are valid
 *   1 — invalid config found (details printed to stderr)
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAURI_DIR = join(__dirname, "..", "src-tauri");
const ROOT      = join(__dirname, "..", "..", "..");

function collectConfigFiles() {
  const files = [];

  // Top-level tauri conf files: tauri.conf.json, tauri.*.conf.json
  if (existsSync(TAURI_DIR)) {
    for (const f of readdirSync(TAURI_DIR)) {
      if (/^tauri(\..+)?\.conf\.json$/.test(f)) {
        files.push(join(TAURI_DIR, f));
      }
    }
  }

  // Capabilities directory
  const capDir = join(TAURI_DIR, "capabilities");
  if (existsSync(capDir)) {
    for (const f of readdirSync(capDir)) {
      if (f.endsWith(".json")) {
        files.push(join(capDir, f));
      }
    }
  }

  return files;
}

let errors = 0;

for (const filePath of collectConfigFiles()) {
  const rel = relative(ROOT, filePath);
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[check-tauri-config] ERROR: cannot parse ${rel}: ${err.message}`);
    errors++;
    continue;
  }

  // Check for plugins.shell.all
  const shellCfg = parsed?.plugins?.shell;
  if (shellCfg !== undefined && shellCfg !== null && typeof shellCfg === "object") {
    if ("all" in shellCfg) {
      console.error(
        `[check-tauri-config] ERROR: ${rel}\n` +
        `  plugins.shell.all is not valid in Tauri v2.\n` +
        `  The tauri-plugin-shell v2 config only accepts "open".\n` +
        `  Remove the "all" field — sidecar access is controlled via capability permissions.`
      );
      errors++;
    }
    // Warn about scope (also a v1 field, benign in v2 but confusing)
    if ("scope" in shellCfg) {
      console.warn(
        `[check-tauri-config] WARN: ${rel}\n` +
        `  plugins.shell.scope is a Tauri v1 field and is ignored in v2.\n` +
        `  Remove it to keep the config clean.`
      );
    }
  }

  // Also scan raw JSON text for "all": in the shell section to catch
  // edge cases where the parser might miss nested configs.
  const raw = readFileSync(filePath, "utf8");
  if (raw.includes('"all"') && raw.includes('"shell"')) {
    // Only flag if the JSON parse above didn't already catch it
    if (!(shellCfg !== undefined && "all" in (shellCfg ?? {}))) {
      console.warn(
        `[check-tauri-config] WARN: ${rel} contains "all" and "shell" — verify manually.`
      );
    }
  }
}

if (errors > 0) {
  console.error(
    `\n[check-tauri-config] ${errors} error(s) found. Fix them before running tauri build.\n`
  );
  process.exit(1);
}

console.log(`[check-tauri-config] ✓ All Tauri configuration files are valid.`);
