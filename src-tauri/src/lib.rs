#[tauri::command]
fn get_data_dir() -> String {
    let home = std::env::var("HOME").expect("HOME env var not set");
    format!("{}/Documents/Claude/Footprint/public/data", home)
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
