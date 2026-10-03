//! The commands the interface calls, and the TypeScript bindings generated from them.

use omnileaf_engine::{AppInfo, Core, FolderCursor, FolderId, FolderPage, FolderSurvey, Library};
use tauri::{AppHandle, State, Wry};
use tauri_specta::{Builder, collect_commands};

use crate::{folder_picker::pick_folder, ipc_error::IpcError};

pub(crate) fn builder() -> Builder<Wry> {
    Builder::new().commands(collect_commands![
        app_info,
        add_library_folder,
        library_folders,
        remove_library_folder
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
) -> Result<Option<FolderSurvey>, IpcError> {
    let picked = tauri::async_runtime::spawn_blocking(move || pick_folder(&app))
        .await
        .map_err(|error| IpcError::internal(&error))??;
    let Some(folder) = picked else {
        return Ok(None);
    };
    Ok(Some(library.add_folder(folder).await?))
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
