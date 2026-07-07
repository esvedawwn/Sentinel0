import path from "path";
import {
  FindingType,
  FindingStatus,
  ScanFinding,
  INSTALLER_EXTS,
  ARCHIVE_EXTS,
  LARGE_FILE_BYTES,
} from "./types.js";

const IDLK_EXT = ".idlk";
const LOCKED_EXT = ".locked";

export function classifyFile(
  filePath: string,
  name: string,
  sizeBytes: number,
  largeFileBytes = LARGE_FILE_BYTES
): ScanFinding | null {
  const ext = path.extname(name).toLowerCase();

  if (sizeBytes === 0) {
    return {
      type: "zero_byte",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "safe_delete",
      reason: "File is empty (0 bytes)",
    };
  }

  if (ext === IDLK_EXT) {
    return {
      type: "idlk_file",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "safe_delete",
      reason: "Adobe InDesign lock file — safe to delete when InDesign is closed",
    };
  }

  if (ext === LOCKED_EXT) {
    return {
      type: "locked_file",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "review",
      reason: "Lock file — verify no application is using it before deleting",
    };
  }

  if (INSTALLER_EXTS.has(ext)) {
    return {
      type: "installer",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "review",
      reason: `Installer file (${ext}) — can usually be deleted after installation`,
    };
  }

  if (ARCHIVE_EXTS.has(ext)) {
    return {
      type: "archive",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "review",
      reason: `Archive file (${ext}) — review whether contents are still needed`,
    };
  }

  if (sizeBytes > largeFileBytes) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      type: "large_file",
      path: filePath,
      name,
      extension: ext,
      sizeBytes,
      findingStatus: "review",
      reason: `Large file (${mb} MB) — verify it is still needed`,
    };
  }

  return null;
}

export function classifyEmptyFolder(dirPath: string): ScanFinding {
  const name = path.basename(dirPath);
  return {
    type: "empty_folder",
    path: dirPath,
    name,
    extension: "",
    sizeBytes: 0,
    findingStatus: "safe_delete",
    reason: "Empty folder",
  };
}

export function classifyDuplicate(
  filePath: string,
  name: string,
  extension: string,
  sizeBytes: number,
  hash: string
): ScanFinding {
  return {
    type: "duplicate",
    path: filePath,
    name,
    extension,
    sizeBytes,
    hash,
    duplicateGroupHash: hash,
    findingStatus: "duplicate",
    reason: `Duplicate file — identical content hash (${hash.slice(0, 8)}…)`,
  };
}

/**
 * Given a map of hash → file entries, produce duplicate findings.
 * Only hashes that appear more than once are duplicates.
 */
export function detectDuplicates(
  hashMap: Map<string, Array<{ path: string; name: string; extension: string; sizeBytes: number }>>
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const [hash, entries] of hashMap) {
    if (entries.length < 2) continue;
    for (const e of entries) {
      findings.push(classifyDuplicate(e.path, e.name, e.extension, e.sizeBytes, hash));
    }
  }
  return findings;
}
