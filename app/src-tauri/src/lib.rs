mod back_swipe;
mod commands;
mod crash_reporting;
#[cfg(all(desktop, feature = "e2e"))]
mod e2e;
#[cfg(target_os = "ios")]
mod folder_access;
#[cfg(any(target_os = "linux", test))]
mod folder_chooser;
mod folder_picker;
mod folder_share;
mod folder_storage;
#[cfg(desktop)]
mod folder_watch;
mod full_screen;
mod ipc_error;
mod library_events;
mod library_problem;
mod omni_protocol;
mod power_mode;
mod problem_reporting;
mod put_away;
mod runtime_config;
mod scheduled_rescans;
mod screen_orientation;
mod share_sign_in;
mod storage;
mod system_bars;
mod system_sign_in;
mod system_settings;
mod tray;
#[cfg(target_os = "android")]
mod tree_storage;
mod version_details;

use std::{
    error::Error,
    path::{Path, PathBuf},
};

use omnileaf_engine::{
    Core, Library, LibraryFolders, RecentLog, ResourceRouter, SystemClock, describe_error,
};
use tauri::{App, Manager};
use tracing_subscriber::{
    Layer, filter::LevelFilter, layer::SubscriberExt, util::SubscriberInitExt,
};

use crate::{
    library_events::LibraryChangesForwarding,
    library_problem::{LibraryAtLaunch, LibraryProblem},
    runtime_config::RuntimeConfig,
    scheduled_rescans::ScheduledRescans,
    storage::StoragePlaces,
};

const CACHE_FOLDER: &str = "cache";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "without its runtime the app has nothing to fall back to"
)]
pub fn run() {
    let recent_log = RecentLog::default();
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(LevelFilter::INFO))
        .with(recent_log.clone())
        .init();
    let config = RuntimeConfig::from_environment();
    let commands = commands::builder();
    let app = tauri::Builder::default()
        .manage(Core::new())
        .manage(recent_log)
        .manage(problem_reporting::ShownProblemReport::default())
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
    #[cfg(target_os = "linux")]
    let app = app.on_page_load(omni_protocol::show_to_every_page);
    #[cfg(target_os = "macos")]
    let app = app
        .manage(full_screen::FullScreenWatch::default())
        .on_window_event(full_screen::keep_keys_on_leaving);
    #[cfg(target_os = "android")]
    let app = app
        .plugin(omnileaf_folder_access::init())
        .plugin(system_bars::plugin())
        .plugin(power_mode::plugin())
        .plugin(screen_orientation::plugin())
        .plugin(system_settings::plugin());
    #[cfg(target_os = "ios")]
    let app = app
        .plugin(omnileaf_folder_access::init())
        .plugin(omnileaf_system_bars::init())
        .plugin(omnileaf_edge_swipe::init());
    #[cfg(all(desktop, feature = "e2e"))]
    let app = app
        .manage(e2e::PickedFolder::from_environment())
        .manage(e2e::CrashReportFolder::from_environment());
    #[cfg(all(feature = "e2e", not(windows)))]
    let app = app.plugin(tauri_plugin_wdio_webdriver::init());
    app.build(tauri::generate_context!())
        .expect("start the Tauri runtime")
        .run(|app, event| put_away::save_when_put_away(app, &event));
}

fn open_library(app: &App, config: &RuntimeConfig) -> Result<(), Box<dyn Error>> {
    let data_dir = config.data_dir.as_deref();
    let folders = library_folders(app, data_dir)?;
    app.manage(StoragePlaces {
        database_folder: folders.database.clone(),
    });
    let library = tauri::async_runtime::block_on(Library::open(folders, SystemClock))?;
    #[cfg(target_os = "android")]
    let library = tree_storage::read_trees(app, library, data_dir);
    app.manage(LibraryChangesForwarding::start(
        app.handle().clone(),
        &library,
    ));
    app.manage(library);
    app.manage(ScheduledRescans::start(app.handle().clone()));
    #[cfg(desktop)]
    app.manage(folder_watch::FolderWatching::start(app, data_dir)?);
    #[cfg(target_os = "ios")]
    folder_access::reopen_picked_folders_in_background(app.handle().clone());
    #[cfg(target_os = "macos")]
    folder_share::remember_shares_in_background(app.handle().clone());
    match open_resources(app, data_dir) {
        Ok(covers) => {
            app.manage(covers);
        }
        Err(error) => {
            tracing::error!(error = %describe_error(error.as_ref()), "start the covers and pages, which won't show");
        }
    }
    Ok(())
}

/// On iOS the Files app shows the documents folder as On My iPhone › Omnileaf, so the database stays out of it.
fn library_folders(app: &App, data_dir: Option<&Path>) -> tauri::Result<LibraryFolders> {
    if let Some(data_dir) = data_dir {
        return Ok(LibraryFolders::from(data_dir.to_path_buf()));
    }
    let database = app.path().app_data_dir()?;
    let home = if cfg!(target_os = "ios") {
        app.path().document_dir()?
    } else {
        database.clone()
    };
    Ok(LibraryFolders { database, home })
}

fn open_resources(app: &App, data_dir: Option<&Path>) -> Result<ResourceRouter, Box<dyn Error>> {
    Ok(ResourceRouter::open(&cache_folder(app, data_dir)?)?)
}

fn cache_folder(app: &App, data_dir: Option<&Path>) -> tauri::Result<PathBuf> {
    match data_dir {
        Some(data_dir) => Ok(data_dir.join(CACHE_FOLDER)),
        None => app.path().app_cache_dir(),
    }
}
