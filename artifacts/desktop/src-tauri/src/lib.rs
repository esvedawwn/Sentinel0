use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

/// Opens the native OS folder-picker dialog and returns the chosen path.
/// Returns `None` if the user cancels.
#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Select Folder to Scan")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

/// Returns the OS-specific application data directory.
/// macOS: ~/Library/Application Support/dev.sentinel.app
/// Windows: %APPDATA%\dev.sentinel.app
#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Option<String> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![pick_folder, get_app_data_dir])
        .setup(|app| {
            let handle = app.handle().clone();

            // Spawn the bundled API server as a background sidecar.
            // The sidecar binary is placed in src-tauri/binaries/ at build time
            // by the `build:server` script (Node.js SEA via esbuild + postject).
            tauri::async_runtime::spawn(async move {
                let db_path = handle
                    .path()
                    .app_data_dir()
                    .expect("no app data dir")
                    .join("sentinel.db")
                    .to_string_lossy()
                    .to_string();

                let sidecar = handle
                    .shell()
                    .sidecar("server")
                    .expect("server sidecar not found — run `pnpm build:server` first");

                let (_rx, _child) = sidecar
                    .env("PORT", "38080")
                    .env("SENTINEL_DB_PATH", db_path)
                    .spawn()
                    .expect("failed to spawn server sidecar");

                // _child kept alive — dropping it would kill the sidecar process
                std::mem::forget(_child);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
