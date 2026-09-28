//! Asks the user for a folder with the platform's own picker.

use std::path::PathBuf;

use tauri::AppHandle;

use crate::ipc_error::IpcError;

#[cfg(desktop)]
pub(crate) fn pick_folder(app: &AppHandle) -> Result<Option<PathBuf>, IpcError> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(FilePath::into_path)
        .transpose()
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(mobile)]
pub(crate) fn pick_folder(_app: &AppHandle) -> Result<Option<PathBuf>, IpcError> {
    Err(IpcError::folder_picker_unavailable())
}
