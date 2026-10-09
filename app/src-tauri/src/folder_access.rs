use omnileaf_engine::{Library, LibraryError, describe_error};
use omnileaf_folder_access::FolderAccess;
use tauri::{AppHandle, Manager, Runtime};

/// Opens every folder picked through Files again, since iOS only grants a picked folder until the app quits.
pub(crate) async fn reopen_picked_folders<R: Runtime>(
    app: &impl Manager<R>,
    library: &Library,
) -> Result<(), LibraryError> {
    let access = app.state::<FolderAccess<R>>().inner().clone();
    let unopened = library
        .restore_folder_access(move |bookmark| access.reopen(bookmark))
        .await?;
    for (folder, error) in unopened {
        tracing::warn!(%folder, error = %describe_error(&error), "reopen a folder picked in Files");
    }
    Ok(())
}

/// Reopens the picked folders once the library is open, so a slow drive or cloud folder can't hold up the first screen.
pub(crate) fn reopen_picked_folders_in_background<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let library = app.state::<Library>();
        if let Err(error) = reopen_picked_folders(&app, &library).await {
            tracing::warn!(error = %describe_error(&error), "reopen the folders picked in Files");
        }
    });
}
