//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod commands;
#[cfg(all(desktop, feature = "e2e"))]
mod e2e;
mod folder_picker;
mod ipc_error;
mod omni_protocol;
mod runtime_config;

use std::error::Error;

use omnileaf_engine::{Core, Library, ResourceRouter, SystemClock};
use tauri::{App, Manager};

use crate::runtime_config::RuntimeConfig;

/// Where the cache goes inside a data folder set for tests, so they leave nothing in the platform's cache folder.
const CACHE_FOLDER: &str = "cache";

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
        .invoke_handler(commands.invoke_handler())
        .register_asynchronous_uri_scheme_protocol(omni_protocol::SCHEME, omni_protocol::answer)
        .setup(move |app| {
            open_library(app, config?).inspect_err(|error| {
                tracing::error!(%error, "open the library");
            })
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

/// Opens the library and its covers before the window shows, since every library command and cover needs them.
fn open_library(app: &App, config: RuntimeConfig) -> Result<(), Box<dyn Error>> {
    let (home, cache) = match config.data_dir {
        Some(data_dir) => (data_dir.clone(), data_dir.join(CACHE_FOLDER)),
        None => (app.path().app_data_dir()?, app.path().app_cache_dir()?),
    };
    let library = tauri::async_runtime::block_on(Library::open(home, SystemClock))?;
    let resources = ResourceRouter::open(&cache)?;
    app.manage(library);
    app.manage(resources);
    Ok(())
}
