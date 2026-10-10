use omnileaf_engine::RootLocator;
use tauri::Window;

use crate::ipc_error::IpcError;

#[cfg(desktop)]
pub(crate) fn pick_folder(window: &Window) -> Result<Option<RootLocator>, IpcError> {
    use tauri_plugin_dialog::FilePath;

    #[cfg(feature = "e2e")]
    if let Some(folder) = crate::e2e::picked_folder(tauri::Manager::app_handle(window)) {
        return Ok(Some(folder.into()));
    }
    folder_dialog(window)
        .blocking_pick_folder()
        .map(FilePath::into_path)
        .transpose()
        .map(|picked| picked.map(RootLocator::from))
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(desktop)]
fn folder_dialog<R: tauri::Runtime>(
    window: &Window<R>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    use tauri_plugin_dialog::DialogExt;

    window.dialog().file().set_parent(window)
}

#[cfg(target_os = "ios")]
pub(crate) fn pick_folder(window: &Window) -> Result<Option<RootLocator>, IpcError> {
    use omnileaf_folder_access::FolderAccess;
    use tauri::Manager;

    window
        .state::<FolderAccess<tauri::Wry>>()
        .pick_folder()
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(target_os = "android")]
pub(crate) fn pick_folder(_window: &Window) -> Result<Option<RootLocator>, IpcError> {
    Err(IpcError::folder_picker_unavailable())
}

#[cfg(all(test, desktop))]
mod tests {
    use tauri::{
        WebviewUrl, WebviewWindowBuilder,
        test::{mock_builder, mock_context, noop_assets},
    };

    use super::folder_dialog;

    #[test]
    fn the_folder_dialog_belongs_to_the_window_that_asked() {
        let app = mock_builder()
            .plugin(tauri_plugin_dialog::init())
            .build(mock_context(noop_assets()))
            .unwrap();
        let asking = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();

        let dialog = folder_dialog(&asking.as_ref().window());

        assert!(format!("{dialog:?}").contains("parent: Some("));
    }
}
