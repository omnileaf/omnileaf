//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod commands;
#[cfg(all(desktop, feature = "e2e"))]
mod e2e;
mod folder_picker;
mod ipc_error;
mod runtime_config;
mod system_bars;
mod version_details;

use std::error::Error;

use omnileaf_engine::{Core, Library, SystemClock};
use tauri::{App, Manager};

use crate::runtime_config::RuntimeConfig;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "without its runtime the app has nothing to fall back to"
)]
pub fn run() {
    tracing_subscriber::fmt::init();
    let config = RuntimeConfig::from_environment();
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
        .setup(move |app| {
            open_library(app, config?).inspect_err(|error| {
                tracing::error!(%error, "open the library");
            })
        });
    #[cfg(desktop)]
    let app = app.plugin(tauri_plugin_dialog::init());
    #[cfg(target_os = "android")]
    let app = app.plugin(system_bars::plugin());
    #[cfg(all(desktop, feature = "e2e"))]
    let app = app.manage(e2e::PickedFolder::from_environment());
    #[cfg(all(feature = "e2e", not(windows)))]
    let app = app.plugin(tauri_plugin_wdio_webdriver::init());
    app.run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}

/// Opens the library before the window shows, since every library command needs it.
fn open_library(app: &App, config: RuntimeConfig) -> Result<(), Box<dyn Error>> {
    let home = match config.data_dir {
        Some(data_dir) => data_dir,
        None => app.path().app_data_dir()?,
    };
    let library = tauri::async_runtime::block_on(Library::open(home, SystemClock))?;
    app.manage(library);
    Ok(())
}
