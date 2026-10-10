use omnileaf_engine::RootLocator;
use tauri::AppHandle;

use crate::ipc_error::IpcError;

#[cfg(desktop)]
pub(crate) fn pick_folder(app: &AppHandle) -> Result<Option<RootLocator>, IpcError> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    #[cfg(feature = "e2e")]
    if let Some(folder) = crate::e2e::picked_folder(app) {
        return Ok(Some(folder.into()));
    }
    #[cfg(target_os = "linux")]
    crate::folder_chooser::require_installed_folder_chooser()?;
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(FilePath::into_path)
        .transpose()
        .map(|picked| picked.map(RootLocator::from))
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(target_os = "ios")]
pub(crate) fn pick_folder(app: &AppHandle) -> Result<Option<RootLocator>, IpcError> {
    use omnileaf_folder_access::FolderAccess;
    use tauri::Manager;

    app.state::<FolderAccess<tauri::Wry>>()
        .pick_folder()
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(target_os = "android")]
pub(crate) fn pick_folder(_app: &AppHandle) -> Result<Option<RootLocator>, IpcError> {
    Err(IpcError::folder_picker_unavailable())
}
