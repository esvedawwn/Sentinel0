/**
 * Desktop bridge — wraps Tauri v2 IPC calls behind feature-detected helpers.
 *
 * All functions degrade gracefully in browser mode:
 *   isDesktop()      → false
 *   pickFolder()     → null
 *   getAppDataDir()  → null
 *
 * The Tauri global (`window.__TAURI__`) is injected by the Tauri runtime when
 * `withGlobalTauri: true` is set in tauri.conf.json.  Custom commands
 * (`pick_folder`, `get_app_data_dir`) are registered in `src-tauri/src/lib.rs`.
 */

type TauriGlobal = {
  core: {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
};

function getTauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __TAURI__?: TauriGlobal };
  return w.__TAURI__ ?? null;
}

/** Returns true when the app is running inside the Tauri desktop shell. */
export function isDesktop(): boolean {
  return getTauri() !== null;
}

/**
 * Opens the native OS folder-picker dialog.
 * Returns the chosen absolute path, or null if the user cancels or we're in a browser.
 */
export async function pickFolder(): Promise<string | null> {
  const tauri = getTauri();
  if (!tauri) return null;
  try {
    const result = await tauri.core.invoke<string | null>("pick_folder");
    return result ?? null;
  } catch (err) {
    console.error("[desktop] pick_folder failed:", err);
    return null;
  }
}

/**
 * Returns the OS-specific application data directory path.
 * macOS: ~/Library/Application Support/dev.sentinel.app
 * Returns null in browser mode.
 */
export async function getAppDataDir(): Promise<string | null> {
  const tauri = getTauri();
  if (!tauri) return null;
  try {
    return await tauri.core.invoke<string | null>("get_app_data_dir");
  } catch {
    return null;
  }
}
