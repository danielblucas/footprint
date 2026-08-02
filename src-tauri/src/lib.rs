/// Where the desktop app reads and writes `visited.json` (and archives raw
/// imports to `timeline-raw/`): the repo's own `public/data`, which is the same
/// file the web build ships and `scripts/sync-visited.sh` commits. One source of
/// truth — an import shows up as an uncommitted change, ready to sync.
///
/// The path is absolute because a bundled `.app` has no useful working
/// directory. That makes it brittle in one specific way: **move or rename the
/// repo and this breaks**, and the app will silently open empty (`loadVisited`
/// treats a missing file as "no data"). If the repo moves, change it here AND in
/// `capabilities/default.json` — the fs plugin scope must match, or every write
/// is denied at runtime while the build still succeeds.
#[tauri::command]
fn get_data_dir() -> String {
    let home = std::env::var("HOME").expect("HOME env var not set");
    format!("{}/Developer/Footprint/public/data", home)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_data_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
