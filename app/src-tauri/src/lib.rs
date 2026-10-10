//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

mod back_swipe;
mod commands;
mod crash_reporting;
#[cfg(all(desktop, feature = "e2e"))]
mod e2e;
#[cfg(target_os = "ios")]
mod folder_access;
mod folder_picker;
mod ipc_error;
mod library_events;
mod library_problem;
mod omni_protocol;
mod runtime_config;
mod system_bars;
mod version_details;

use std::{error::Error, path::Path};

use omnileaf_engine::{Core, Library, ResourceRouter, SystemClock, describe_error};
use tauri::{App, Manager};

use crate::{
    library_events::LibraryChangesForwarding,
    library_problem::{LibraryAtLaunch, LibraryProblem},
    runtime_config::RuntimeConfig,
};

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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(commands.invoke_handler())
        .register_asynchronous_uri_scheme_protocol(omni_protocol::SCHEME, omni_protocol::answer)
        .setup(move |app| {
            crash_reporting::install(app.handle());
            commands.mount_events(app);
            let problem = open_library(app, &config?).err().map(|error| {
                tracing::error!(error = %describe_error(error.as_ref()), "open the library");
                LibraryProblem::of(error.as_ref())
            });
            app.manage(LibraryAtLaunch { problem });
            Ok(())
        });
    #[cfg(desktop)]
    let app = app.plugin(tauri_plugin_dialog::init());
    #[cfg(target_os = "android")]
    let app = app.plugin(system_bars::plugin());
    #[cfg(target_os = "ios")]
    let app = app
        .plugin(omnileaf_folder_access::init())
        .plugin(omnileaf_edge_swipe::init());
    #[cfg(all(desktop, feature = "e2e"))]
    let app = app
        .manage(e2e::PickedFolder::from_environment())
        .manage(e2e::CrashReportFolder::from_environment());
    #[cfg(all(feature = "e2e", not(windows)))]
    let app = app.plugin(tauri_plugin_wdio_webdriver::init());
    app.run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}

/// Opens the library before the window shows, since every library command needs it, and starts its covers without waiting on their cache.
fn open_library(app: &App, config: &RuntimeConfig) -> Result<(), Box<dyn Error>> {
    let data_dir = config.data_dir.as_deref();
    let home = match data_dir {
        Some(data_dir) => data_dir.to_path_buf(),
        None => app.path().app_data_dir()?,
    };
    let library = tauri::async_runtime::block_on(Library::open(home, SystemClock))?;
    app.manage(LibraryChangesForwarding::start(
        app.handle().clone(),
        &library,
    ));
    app.manage(library);
    #[cfg(target_os = "ios")]
    folder_access::reopen_picked_folders_in_background(app.handle().clone());
    match open_covers(app, data_dir) {
        Ok(covers) => {
            app.manage(covers);
        }
        Err(error) => {
            tracing::error!(error = %describe_error(error.as_ref()), "start the covers, which won't show");
        }
    }
    Ok(())
}

fn open_covers(app: &App, data_dir: Option<&Path>) -> Result<ResourceRouter, Box<dyn Error>> {
    let cache = match data_dir {
        Some(data_dir) => data_dir.join(CACHE_FOLDER),
        None => app.path().app_cache_dir()?,
    };
    Ok(ResourceRouter::open(&cache)?)
}
