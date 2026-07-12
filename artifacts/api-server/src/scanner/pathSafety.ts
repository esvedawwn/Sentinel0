/**
 * Path safety utilities for the Sentinel scanner.
 *
 * Enforces three layers of protection before any filesystem scan begins:
 *
 * 1. Input sanitisation — reject path strings containing traversal sequences
 *    (e.g. "../../etc/passwd") before any filesystem call is made.
 * 2. System-directory blocking — reject paths that resolve into OS-reserved
 *    areas where Sentinel must never operate.
 * 3. Approved-root enforcement — every scan must start from a path that the
 *    user explicitly added via the Scan Roots settings panel. Paths outside
 *    the approved set are rejected unconditionally.
 * 4. Symlink-escape detection — before descending into a symlink target,
 *    resolve the real path and confirm it still lives inside the approved root.
 *
 * None of these functions ever modify the filesystem. All are pure or
 * async-read-only. Errors are returned as typed result objects, never thrown,
 * so callers can surface them gracefully rather than crashing.
 */

import path from "path";
import fs from "fs/promises";

// ── System-directory block list ───────────────────────────────────────────────

/**
 * Absolute path prefixes that Sentinel must never scan, regardless of what
 * the user types. Covers macOS, Linux, and Windows system areas.
 */
export const SYSTEM_BLOCK_PREFIXES: readonly string[] = [
  // macOS
  "/System",
  "/private/etc",
  "/private/var",
  "/private/tmp",
  "/Library/Apple",
  "/Library/Frameworks",
  "/Library/Extensions",
  "/Library/CoreMediaIO",
  "/usr",
  "/bin",
  "/sbin",
  "/dev",
  "/Volumes/Recovery",
  // Linux
  "/proc",
  "/sys",
  "/run",
  "/boot",
  "/lib",
  "/lib64",
  "/sbin",
  "/etc",
  // Windows
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
];

/**
 * App-bundle extensions that should be skipped during directory walking
 * (their internals are not user-managed files and can be very large).
 */
export const SKIP_BUNDLE_EXTENSIONS = new Set([".app", ".framework", ".plugin", ".kext", ".bundle"]);

// ── Typed result ──────────────────────────────────────────────────────────────

export type SafetyOk = { ok: true };
export type SafetyOkValue<T> = { ok: true; value: T };
export type SafetyErr = { ok: false; reason: string };
export type SafetyResult = SafetyOk | SafetyErr;
export type SafetyResultValue<T> = SafetyOkValue<T> | SafetyErr;

function ok(): SafetyOk {
  return { ok: true };
}
function okValue<T>(value: T): SafetyOkValue<T> {
  return { ok: true, value };
}
function err(reason: string): SafetyErr {
  return { ok: false, reason };
}

// ── 1. Input sanitisation ─────────────────────────────────────────────────────

/**
 * Reject a raw path input before any filesystem access.
 * Catches `..` traversal, null bytes, and overly long paths.
 * Returns a normalised absolute path on success.
 */
export function sanitiseScanInput(rawPath: string): SafetyResultValue<string> {
  if (!rawPath || !rawPath.trim()) {
    return err("Path must not be empty.");
  }

  const trimmed = rawPath.trim();

  // Null bytes are always invalid in paths
  if (trimmed.includes("\0")) {
    return err("Path contains a null byte.");
  }

  // Reject traversal sequences in the RAW input before normalising.
  // path.normalize() resolves ".." segments, so we must check the original
  // string — otherwise "/Users/alice/../../etc/passwd" would slip through.
  const rawSegments = trimmed.split(/[/\\]/);
  if (rawSegments.includes("..")) {
    return err("Path contains directory traversal sequences (..).");
  }

  const normalised = path.normalize(trimmed);

  // Must be absolute
  if (!path.isAbsolute(normalised)) {
    return err("Path must be absolute (must start with / on macOS/Linux or a drive letter on Windows).");
  }

  // Reasonable length guard
  if (normalised.length > 4096) {
    return err("Path exceeds maximum allowed length (4096 characters).");
  }

  return okValue(normalised);
}

// ── 2. System-directory blocking ──────────────────────────────────────────────

/**
 * Returns true if the given normalised absolute path falls within a
 * known OS-reserved system directory that Sentinel should never touch.
 */
export function isSystemPath(normalisedPath: string): boolean {
  const lower = normalisedPath.toLowerCase();
  for (const prefix of SYSTEM_BLOCK_PREFIXES) {
    const lowerPrefix = prefix.toLowerCase();
    if (lower === lowerPrefix || lower.startsWith(lowerPrefix + path.sep) || lower.startsWith(lowerPrefix + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Validate that a scan root isn't a system-reserved path.
 */
export function checkNotSystemPath(normalisedPath: string): SafetyResult {
  if (isSystemPath(normalisedPath)) {
    return err(`Path "${normalisedPath}" is a protected system directory and cannot be scanned.`);
  }
  return ok();
}

// ── 3. Approved-root enforcement ──────────────────────────────────────────────

/**
 * Check that a proposed scan path is within (or equal to) one of the
 * user-approved roots. Both paths must already be normalised absolute paths.
 *
 * If no approved roots have been registered yet (empty list), we allow
 * the scan only in "simulate" / "sample" mode — callers are responsible
 * for checking mode before calling this function.
 */
export function isWithinApprovedRoot(scanPath: string, approvedRoots: string[]): boolean {
  for (const root of approvedRoots) {
    const normRoot = path.normalize(root);
    const normScan = path.normalize(scanPath);
    if (normScan === normRoot || normScan.startsWith(normRoot + path.sep)) {
      return true;
    }
  }
  return false;
}

/**
 * Full approved-root validation for a scan path.
 * Returns an error if approvedRoots is empty for a real scan,
 * or if the path falls outside all approved roots.
 */
export function validateAgainstApprovedRoots(scanPath: string, approvedRoots: string[]): SafetyResult {
  if (approvedRoots.length === 0) {
    return err(
      "No approved scan roots are configured. Add a folder in Settings → Approved Scan Roots before starting a real scan."
    );
  }
  if (!isWithinApprovedRoot(scanPath, approvedRoots)) {
    return err(
      `Path "${scanPath}" is not within any approved scan root. ` +
        `Approved roots: ${approvedRoots.join(", ")}`
    );
  }
  return ok();
}

// ── 4. Symlink-escape detection ───────────────────────────────────────────────

/**
 * Resolve a file path's real location (following all symlinks) and confirm
 * the resolved path still lives inside the approved root.
 *
 * Call this before yielding a symlink entry during directory walking.
 * If the real path escapes the approved root, the entry should be skipped.
 *
 * Returns `{ ok: true, value: realPath }` on success.
 */
export async function resolveAndCheckSymlink(
  filePath: string,
  approvedRoot: string
): Promise<SafetyResultValue<string>> {
  let realPath: string;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    return err(`Could not resolve real path of "${filePath}".`);
  }

  const normRoot = path.normalize(approvedRoot);
  if (realPath !== normRoot && !realPath.startsWith(normRoot + path.sep)) {
    return err(
      `Symlink "${filePath}" escapes the approved root: resolves to "${realPath}" which is outside "${approvedRoot}".`
    );
  }

  return okValue(realPath);
}

// ── 5. Composite validation for scan start ────────────────────────────────────

/**
 * Run all safety checks before starting a real filesystem scan:
 *   1. Sanitise input (no traversal, must be absolute)
 *   2. Block system paths
 *   3. Confirm within approved roots
 *
 * Returns a normalised absolute path on success.
 */
export function validateScanStart(
  rawPath: string,
  approvedRoots: string[]
): SafetyResultValue<string> {
  const sanitised = sanitiseScanInput(rawPath);
  if (!sanitised.ok) return sanitised;
  const normPath = (sanitised as SafetyOkValue<string>).value;

  const sysCheck = checkNotSystemPath(normPath);
  if (!sysCheck.ok) return sysCheck;

  const rootCheck = validateAgainstApprovedRoots(normPath, approvedRoots);
  if (!rootCheck.ok) return rootCheck;

  return okValue(normPath);
}
