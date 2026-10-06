//! The commands the interface calls, and the TypeScript bindings generated from them.

use omnileaf_engine::{
    AppInfo, AppLanguage, Core, FolderCursor, FolderId, FolderPage, FolderRescan, FolderScan,
    Library, ProjectLink, ScanProgress,
};
use tauri::{AppHandle, Manager, State, Wry, ipc::Channel};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tauri_specta::{Builder, collect_commands};

use crate::{
    folder_picker::pick_folder,
    ipc_error::IpcError,
    system_bars::{self, Theme, ThemePreference},
    version_details,
};

pub(crate) fn builder() -> Builder<Wry> {
    Builder::new().commands(collect_commands![
        app_info,
        add_library_folder,
        match_system_bars,
        library_folders,
        remove_library_folder,
        rescan_library_folder,
        rescan_library_folders,
        first_launch_finished,
        finish_first_launch,
        set_app_language,
        copy_version_details,
        open_project_link
    ])
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn app_info(core: State<'_, Core>) -> AppInfo {
    core.app_info().clone()
}

#[tauri::command]
#[specta::specta]
async fn add_library_folder(
    app: AppHandle,
    library: State<'_, Library>,
    on_progress: Channel<ScanProgress>,
) -> Result<Option<FolderScan>, IpcError> {
    let picked = tauri::async_runtime::spawn_blocking(move || pick_folder(&app))
        .await
        .map_err(|error| IpcError::internal(&error))??;
    let Some(folder) = picked else {
        return Ok(None);
    };
    Ok(Some(
        library
            .add_folder(folder, reporting_to(on_progress))
            .await?,
    ))
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_folder(
    library: State<'_, Library>,
    id: FolderId,
    on_progress: Channel<ScanProgress>,
) -> Result<FolderRescan, IpcError> {
    Ok(library.rescan_folder(id, reporting_to(on_progress)).await?)
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_folders(
    library: State<'_, Library>,
) -> Result<Vec<FolderRescan>, IpcError> {
    Ok(library.rescan_folders().await?)
}

fn reporting_to(on_progress: Channel<ScanProgress>) -> impl FnMut(ScanProgress) + Send {
    move |progress| {
        if let Err(error) = on_progress.send(progress) {
            tracing::debug!(%error, "the interface stopped listening for scan progress");
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn match_system_bars(
    app: AppHandle,
    theme: Theme,
    preference: ThemePreference,
) -> Result<(), IpcError> {
    system_bars::match_theme(&app, theme, preference).await
}

#[tauri::command]
#[specta::specta]
async fn library_folders(
    library: State<'_, Library>,
    after: Option<FolderCursor>,
) -> Result<FolderPage, IpcError> {
    Ok(library.folders(after).await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_library_folder(library: State<'_, Library>, id: FolderId) -> Result<(), IpcError> {
    Ok(library.remove_folder(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn first_launch_finished(library: State<'_, Library>) -> Result<bool, IpcError> {
    Ok(library.first_launch_finished().await?)
}

#[tauri::command]
#[specta::specta]
async fn copy_version_details(app: AppHandle) -> Result<(), IpcError> {
    tauri::async_runtime::spawn_blocking(move || copy_details(&app))
        .await
        .map_err(|error| IpcError::internal(&error))?
}

fn copy_details(app: &AppHandle) -> Result<(), IpcError> {
    let details = version_details::current(app.state::<Core>().app_info().clone());
    app.clipboard()
        .write_text(details.to_string())
        .map_err(|error| IpcError::clipboard_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn finish_first_launch(library: State<'_, Library>) -> Result<(), IpcError> {
    Ok(library.finish_first_launch().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_app_language(
    library: State<'_, Library>,
    language: AppLanguage,
) -> Result<(), IpcError> {
    Ok(library.set_language(language).await?)
}

#[tauri::command]
#[specta::specta]
async fn open_project_link(app: AppHandle, link: ProjectLink) -> Result<(), IpcError> {
    app.opener()
        .open_url(link.url(), None::<&str>)
        .map_err(|error| IpcError::browser_unavailable(&error))
}

#[cfg(test)]
mod tests {
    use std::{env, fs, process};

    use specta_typescript::Typescript;

    use super::builder;

    const COMMITTED_BINDINGS: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/ipc/bindings.ts");
    const UPDATE_REQUEST: &str = "UPDATE_BINDINGS";

    fn generated_bindings() -> String {
        let path = env::temp_dir().join(format!("omnileaf-bindings-{}.ts", process::id()));
        builder().export(Typescript::default(), &path).unwrap();
        let bindings = fs::read_to_string(&path).unwrap();
        fs::remove_file(&path).unwrap();
        bindings
    }

    #[test]
    fn committed_bindings_match_the_commands() {
        let generated = generated_bindings();

        if env::var_os(UPDATE_REQUEST).is_some() {
            fs::write(COMMITTED_BINDINGS, &generated).unwrap();
        }
        let committed = fs::read_to_string(COMMITTED_BINDINGS).unwrap_or_default();

        assert!(
            committed == generated,
            "the TypeScript bindings are out of date; run `cargo xtask bindings`"
        );
    }
}
