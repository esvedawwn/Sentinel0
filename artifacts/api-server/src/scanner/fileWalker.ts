import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { SKIP_DIRS, MAX_HASH_SIZE } from "./types.js";

/**
 * Compute MD5 hash of a file. Returns null if the file is too large,
 * unreadable, or an error occurs. Non-blocking via streaming.
 */
export async function computeHash(filePath: string, sizeBytes: number): Promise<string | null> {
  if (sizeBytes > MAX_HASH_SIZE || sizeBytes === 0) return null;
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  } catch {
    return null;
  }
}

export interface WalkEntry {
  path: string;
  name: string;
  sizeBytes: number;
  isDir: boolean;
}

/**
 * Async generator that yields every file/directory under rootPath,
 * skipping known build/VCS directories.
 */
export async function* walkDirectory(
  rootPath: string,
  signal?: AbortSignal
): AsyncGenerator<WalkEntry> {
  if (signal?.aborted) return;

  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (signal?.aborted) return;

    const fullPath = path.join(rootPath, entry.name);

    // Skip known non-user directories
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;

      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      yield { path: fullPath, name: entry.name, sizeBytes: 0, isDir: true };
      yield* walkDirectory(fullPath, signal);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      let stat;
      try {
        stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      yield { path: fullPath, name: entry.name, sizeBytes: stat.size, isDir: false };
    }
  }
}

/**
 * Count direct children of a directory. Returns 0 if unreadable.
 */
export async function countChildren(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length;
  } catch {
    return 0;
  }
}
