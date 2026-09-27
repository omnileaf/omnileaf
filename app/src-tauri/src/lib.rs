//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod commands;

use omnileaf_engine::Core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "without its runtime the app has nothing to fall back to"
)]
pub fn run() {
    let commands = commands::builder();
    tauri::Builder::default()
        .manage(Core::new())
        .invoke_handler(commands.invoke_handler())
        .run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}
