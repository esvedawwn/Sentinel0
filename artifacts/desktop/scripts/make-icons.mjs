/**
 * Generates all Tauri icon sizes from a source PNG.
 *
 * Preferred usage: `pnpm --filter @workspace/desktop run make-icons`
 * (Uses `tauri icon` when available, falls back to ImageMagick / sips)
 *
 * Requirements on macOS: ImageMagick (`brew install imagemagick`)
 * Requirements on any platform: Node.js 21+, ImageMagick 7+
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP  = join(__dirname, "..");
const ICONS    = join(DESKTOP,  "src-tauri", "icons");
const SOURCE   = join(ICONS,    "icon.png");   // 1024x1024 source

mkdirSync(ICONS, { recursive: true });

// ── Try tauri icon first (generates all formats including ICNS automatically) ─
console.log("Attempting tauri icon generation…");
try {
  execSync(`pnpm exec tauri icon ${SOURCE}`, { cwd: DESKTOP, stdio: "inherit" });
  console.log("\n✓ Icons generated via tauri icon");
  process.exit(0);
} catch {
  console.log("tauri icon unavailable — falling back to ImageMagick");
}

// ── ImageMagick fallback ───────────────────────────────────────────────────────
function magick(...args) {
  const r = spawnSync("magick", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`magick failed: magick ${args.join(" ")}`);
}

if (!existsSync(SOURCE)) {
  // Generate a minimal source icon programmatically using ImageMagick
  console.log("Generating source icon…");
  magick(
    "-size", "1024x1024", "xc:#111111",
    "-fill", "#34D399",
    "-font", "DejaVu-Sans-Bold",
    "-pointsize", "580",
    "-gravity", "center",
    "-annotate", "0", "S",
    SOURCE
  );
}

console.log("Resizing to required PNG sizes…");
const sizes = [
  ["32x32.png",       32],
  ["128x128.png",    128],
  ["128x128@2x.png", 256],
  ["256x256.png",    256],
  ["512x512.png",    512],
];
for (const [name, px] of sizes) {
  magick(SOURCE, "-resize", `${px}x${px}`, join(ICONS, name));
  console.log(`  ✓ ${name}`);
}

// ── ICO (multi-resolution) ─────────────────────────────────────────────────────
console.log("Generating icon.ico…");
magick(
  SOURCE,
  "(", "-clone", "0", "-resize", "256x256", ")",
  "(", "-clone", "0", "-resize",  "48x48",  ")",
  "(", "-clone", "0", "-resize",  "32x32",  ")",
  "(", "-clone", "0", "-resize",  "16x16",  ")",
  "-delete", "0",
  join(ICONS, "icon.ico")
);
console.log("  ✓ icon.ico");

// ── ICNS (macOS only) ──────────────────────────────────────────────────────────
if (os.platform() === "darwin") {
  console.log("Generating icon.icns via sips + iconutil…");
  const iconset = join(os.tmpdir(), "sentinel.iconset");
  mkdirSync(iconset, { recursive: true });

  const sets = [
    ["icon_16x16.png",       16],
    ["icon_16x16@2x.png",    32],
    ["icon_32x32.png",       32],
    ["icon_32x32@2x.png",    64],
    ["icon_128x128.png",    128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png",    256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png",    512],
    ["icon_512x512@2x.png",1024],
  ];

  for (const [name, px] of sets) {
    execSync(
      `sips -z ${px} ${px} "${SOURCE}" --out "${join(iconset, name)}"`,
      { stdio: "pipe" }
    );
  }
  execSync(`iconutil -c icns "${iconset}" --output "${join(ICONS, "icon.icns")}"`, { stdio: "inherit" });
  console.log("  ✓ icon.icns");
} else {
  // Non-macOS: build minimal ICNS from PNGs (Node.js fallback)
  console.log("Generating icon.icns (Node.js fallback — macOS preferred for production)…");
  const { readFileSync, writeFileSync } = await import("fs");

  function entry(type, buf) {
    const h = Buffer.alloc(8);
    h.write(type, 0, "ascii");
    h.writeUInt32BE(8 + buf.length, 4);
    return Buffer.concat([h, buf]);
  }
  const ic07 = entry("ic07", readFileSync(join(ICONS, "128x128.png")));
  const ic08 = entry("ic08", readFileSync(join(ICONS, "256x256.png")));
  const ic09 = entry("ic09", readFileSync(join(ICONS, "512x512.png")));
  const ic10 = entry("ic10", readFileSync(SOURCE));
  const body = Buffer.concat([ic07, ic08, ic09, ic10]);
  const hdr = Buffer.alloc(8);
  hdr.write("icns", 0, "ascii");
  hdr.writeUInt32BE(8 + body.length, 4);
  writeFileSync(join(ICONS, "icon.icns"), Buffer.concat([hdr, body]));
  console.log("  ✓ icon.icns (Node.js fallback — re-run on macOS for production quality)");
}

console.log("\n✓ All icons generated:", ICONS);
