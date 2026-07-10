import fsPromises from "fs/promises";
import path from "path";
import { SKIP_DIRS } from "./types.js";

export interface WalkEntry {
  path: string;
  name: string;
  sizeBytes: number;
  isDir: boolean;
  createdAt?: Date;
  modifiedAt?: Date;
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
    entries = await fsPromises.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (signal?.aborted) return;

    const fullPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;

      yield { path: fullPath, name: entry.name, sizeBytes: 0, isDir: true };
      yield* walkDirectory(fullPath, signal);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      let stat;
      try {
        stat = await fsPromises.stat(fullPath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      yield {
        path: fullPath,
        name: entry.name,
        sizeBytes: stat.size,
        isDir: false,
        createdAt: stat.birthtime,
        modifiedAt: stat.mtime,
      };
    }
  }
}

/**
 * Count direct children of a directory that aren't hidden system files.
 * Returns 0 if unreadable.
 */
export async function countChildren(dirPath: string): Promise<number> {
  try {
    const entries = await fsPromises.readdir(dirPath);
    return entries.filter((e) => e !== ".DS_Store" && !e.startsWith("._")).length;
  } catch {
    return 0;
  }
}
