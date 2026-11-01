use tauri::AppHandle;

use crate::ipc_error::IpcError;

#[cfg(target_os = "android")]
pub(crate) struct HandedDocumentCopies(std::path::PathBuf);

#[cfg(target_os = "android")]
impl HandedDocumentCopies {
    pub(crate) fn in_folder(folder: std::path::PathBuf) -> Self {
        Self(folder)
    }
}

#[cfg(target_os = "android")]
pub(crate) async fn queue(app: &AppHandle, uri: String) -> Result<(), IpcError> {
    use omnileaf_folder_access::{DocumentUri, FolderAccess};
    use tauri::Manager;

    let uri = DocumentUri::parse(uri).map_err(|error| IpcError::document_unreadable(&error))?;
    let access = app.state::<FolderAccess<tauri::Wry>>().inner().clone();
    let copies = app
        .try_state::<HandedDocumentCopies>()
        .ok_or_else(|| IpcError::internal(&std::io::Error::from(std::io::ErrorKind::NotFound)))?
        .0
        .clone();
    let document =
        tauri::async_runtime::spawn_blocking(move || access.open_handed_document(&uri, copies))
            .await
            .map_err(|error| IpcError::internal(&error))?
            .map_err(|error| IpcError::document_unreadable(&error))?;
    let (storage, path) = document.into_storage();
    crate::files_to_open::request_document(app, storage, path);
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "the Android function it stands in for awaits the provider"
)]
pub(crate) async fn queue(_app: &AppHandle, _uri: String) -> Result<(), IpcError> {
    Err(IpcError::internal(&std::io::Error::from(
        std::io::ErrorKind::Unsupported,
    )))
}
