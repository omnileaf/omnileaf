//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod commands;

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
        .invoke_handler(commands.invoke_handler());
    #[cfg(all(feature = "e2e", not(windows)))]
    let app = app.plugin(tauri_plugin_wdio_webdriver::init());
    app.run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}
