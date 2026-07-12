import fsPromises from "fs/promises";
import path from "path";
import { SKIP_DIRS } from "./types.js";
import { SKIP_BUNDLE_EXTENSIONS, resolveAndCheckSymlink } from "./pathSafety.js";

export interface WalkEntry {
  path: string;
  name: string;
  sizeBytes: number;
  isDir: boolean;
  createdAt?: Date;
  modifiedAt?: Date;
}

/**
 * Async generator that yields every file/directory under rootPath.
 *
 * Safety measures applied during the walk:
 *  - Known build/VCS directories (SKIP_DIRS) are skipped entirely.
 *  - macOS/iOS app bundles (.app, .framework, etc.) are skipped as
 *    their internals are not user-managed files.
 *  - Symbolic links are resolved via realpath; if the resolved path
 *    escapes the approved root, the entry is silently skipped.
 *
 * @param rootPath     The directory to walk (must be absolute + validated).
 * @param signal       AbortSignal — set to abort when a scan is cancelled.
 * @param approvedRoot The user-approved root this walk was started from.
 *                     Defaults to rootPath itself when omitted (relaxed mode
 *                     used for sample / simulate scans).
 */
export async function* walkDirectory(
  rootPath: string,
  signal?: AbortSignal,
  approvedRoot?: string
): AsyncGenerator<WalkEntry> {
  if (signal?.aborted) return;

  const root = approvedRoot ?? rootPath;

  let entries;
  try {
    entries = await fsPromises.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (signal?.aborted) return;

    const fullPath = path.join(rootPath, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (entry.isDirectory()) {
      // Skip known heavy build/VCS/cache directories
      if (SKIP_DIRS.has(entry.name)) continue;
      // Skip app bundles and frameworks (macOS-specific)
      if (SKIP_BUNDLE_EXTENSIONS.has(ext)) continue;

      yield { path: fullPath, name: entry.name, sizeBytes: 0, isDir: true };
      yield* walkDirectory(fullPath, signal, root);
    } else if (entry.isFile()) {
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
    } else if (entry.isSymbolicLink()) {
      // Resolve the symlink and verify it doesn't escape the approved root
      const check = await resolveAndCheckSymlink(fullPath, root);
      if (!check.ok) {
        // Silently skip symlinks that escape the approved root
        continue;
      }

      let stat;
      try {
        stat = await fsPromises.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isFile()) {
        yield {
          path: fullPath,
          name: entry.name,
          sizeBytes: stat.size,
          isDir: false,
          createdAt: stat.birthtime,
          modifiedAt: stat.mtime,
        };
      } else if (stat.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (SKIP_BUNDLE_EXTENSIONS.has(ext)) continue;
        yield { path: fullPath, name: entry.name, sizeBytes: 0, isDir: true };
        yield* walkDirectory(fullPath, signal, root);
      }
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
