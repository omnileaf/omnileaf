//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod commands;
mod crash_reporting;
#[cfg(all(desktop, feature = "e2e"))]
mod e2e;
mod folder_picker;
mod ipc_error;
mod version_details;

use omnileaf_engine::Core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "without its runtime the app has nothing to fall back to"
)]
pub fn run() {
    tracing_subscriber::fmt::init();
    let commands = commands::builder();
    let app = tauri::Builder::default()
        .manage(Core::new())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(commands.invoke_handler())
        .setup(|app| {
            crash_reporting::install(app.handle());
            Ok(())
        });
    #[cfg(desktop)]
    let app = app.plugin(tauri_plugin_dialog::init());
    #[cfg(all(desktop, feature = "e2e"))]
    let app = app.manage(e2e::PickedFolder::from_environment());
    #[cfg(all(feature = "e2e", not(windows)))]
    let app = app.plugin(tauri_plugin_wdio_webdriver::init());
    app.run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}
