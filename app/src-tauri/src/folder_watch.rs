use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_engine::{AppFiles, FolderWatchSwitch, Library, LibraryFolders};
use tauri::{App, Manager, async_runtime::JoinHandle};

use crate::CACHE_FOLDER;

/// `WebKitGTK` keeps the webview's data and cache in these entries of the app's local data folder, which on Linux is also the library's home.
#[cfg(target_os = "linux")]
const WEBVIEW_ENTRIES: [&str; 12] = [
    "applications",
    "CacheStorage",
    "cookies",
    "databases",
    "deviceidhashsalts",
    "hsts-storage.sqlite",
    "itp",
    "localstorage",
    "mediakeys",
    "serviceworkers",
    "storage",
    "WebKitCache",
];

pub(crate) struct FolderWatching {
    switch: Arc<FolderWatchSwitch>,
    _task: JoinHandle<()>,
}

impl FolderWatching {
    pub(crate) fn start(
        app: &App,
        library: &LibraryFolders,
        data_dir: Option<&Path>,
    ) -> tauri::Result<Self> {
        let app_files = AppFiles {
            library: library.clone(),
            folders: own_folders(app, data_dir)?,
        };
        let app = app.handle().clone();
        let switch = Arc::new(FolderWatchSwitch::off());
        let watching = Arc::clone(&switch);
        Ok(Self {
            switch,
            _task: tauri::async_runtime::spawn(async move {
                let library = app.state::<Library>();
                library
                    .watch_folders(&app_files, &watching)
                    .await
                    .rescan_on_change()
                    .await;
            }),
        })
    }

    pub(crate) fn turn(&self, is_on: bool) {
        self.switch.turn(is_on);
    }
}

fn own_folders(app: &App, data_dir: Option<&Path>) -> tauri::Result<Vec<PathBuf>> {
    let cache = match data_dir {
        Some(data_dir) => data_dir.join(CACHE_FOLDER),
        None => app.path().app_cache_dir()?,
    };
    #[cfg(target_os = "linux")]
    {
        let webview = app.path().app_local_data_dir()?;
        let mut folders: Vec<PathBuf> = WEBVIEW_ENTRIES
            .iter()
            .map(|entry| webview.join(entry))
            .collect();
        folders.push(cache);
        Ok(folders)
    }
    #[cfg(not(target_os = "linux"))]
    Ok(vec![cache])
}
