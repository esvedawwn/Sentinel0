use tauri::Manager;
use tauri_plugin_shell::ShellExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Spawn the bundled API server as a background sidecar.
            // The sidecar binary is placed in src-tauri/binaries/ at build time
            // by the `build:server` script.
            tauri::async_runtime::spawn(async move {
                let sidecar = handle
                    .shell()
                    .sidecar("server")
                    .expect("server sidecar not found — run `pnpm build:server` first");

                let (_rx, _child) = sidecar
                    .env("PORT", "38080")
                    .env(
                        "SENTINEL_DB_PATH",
                        handle
                            .path()
                            .app_data_dir()
                            .expect("no app data dir")
                            .join("sentinel.db")
                            .to_string_lossy()
                            .to_string(),
                    )
                    .spawn()
                    .expect("failed to spawn server sidecar");

                // _child is kept alive — dropping it would kill the process
                std::mem::forget(_child);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
