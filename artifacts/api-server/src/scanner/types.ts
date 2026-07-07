export type FindingType =
  | "empty_folder"
  | "zero_byte"
  | "idlk_file"
  | "locked_file"
  | "installer"
  | "large_file"
  | "duplicate";

export type FindingStatus = "safe_delete" | "review" | "duplicate";

export interface ScanEntry {
  path: string;
  name: string;
  extension: string;
  isDirectory: boolean;
  sizeBytes: number;
  hash?: string;
}

export interface ScanFinding {
  type: FindingType;
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  hash?: string;
  duplicateGroupHash?: string;
  findingStatus: FindingStatus;
  reason: string;
}

export interface ScanProgress {
  filesScanned: number;
  foldersScanned: number;
  bytesScanned: number;
  currentPath: string;
}

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".next",
  ".nuxt",
  ".turbo",
  "coverage",
  ".pnpm-store",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv",
  ".DS_Store",
]);

export const INSTALLER_EXTS = new Set([
  ".dmg", ".pkg", ".exe", ".msi", ".deb", ".rpm", ".appimage",
  ".run", ".sh",
]);

export const ARCHIVE_EXTS = new Set([
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz",
]);

/** Files > this size trigger a "large_file" finding in real/sample mode (50 MB) */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

/** Files > this size are NOT hashed for duplicate detection (100 MB) */
export const MAX_HASH_SIZE = 100 * 1024 * 1024;
