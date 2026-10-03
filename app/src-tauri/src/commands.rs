//! The commands the interface calls, and the TypeScript bindings generated from them.

use omnileaf_engine::{AppInfo, Core, FolderSurvey, InterfaceError, ProjectLink, survey_folder};
use tauri::{AppHandle, Manager, State, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tauri_specta::{Builder, collect_commands};

use crate::{
    crash_reporting::{CrashReportOffer, CrashReporting},
    folder_picker::pick_folder,
    ipc_error::IpcError,
    version_details,
};

pub(crate) fn builder() -> Builder<Wry> {
    Builder::new().commands(collect_commands![
        app_info,
        add_library_folder,
        copy_version_details,
        open_project_link,
        offer_saved_crash_report,
        offer_interface_error_report,
        send_crash_report,
        copy_crash_report,
        decline_crash_report
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
async fn add_library_folder(app: AppHandle) -> Result<Option<FolderSurvey>, IpcError> {
    tauri::async_runtime::spawn_blocking(move || pick_and_survey(&app))
        .await
        .map_err(|error| IpcError::internal(&error))?
}

fn pick_and_survey(app: &AppHandle) -> Result<Option<FolderSurvey>, IpcError> {
    let Some(folder) = pick_folder(app)? else {
        return Ok(None);
    };
    Ok(Some(survey_folder(&folder)?))
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
async fn open_project_link(app: AppHandle, link: ProjectLink) -> Result<(), IpcError> {
    app.opener()
        .open_url(link.url(), None::<&str>)
        .map_err(|error| IpcError::browser_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn offer_saved_crash_report(app: AppHandle) -> Result<Option<CrashReportOffer>, IpcError> {
    off_the_runtime(move || app.state::<CrashReporting>().offer_saved()).await
}

#[tauri::command]
#[specta::specta]
async fn offer_interface_error_report(
    app: AppHandle,
    error: InterfaceError,
) -> Result<CrashReportOffer, IpcError> {
    off_the_runtime(move || Ok(app.state::<CrashReporting>().offer_interface_error(&error))).await
}

#[tauri::command]
#[specta::specta]
async fn send_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || {
        let reporting = app.state::<CrashReporting>();
        let report = reporting.offered()?;
        app.opener()
            .open_url(report.new_issue_url(), None::<&str>)
            .map_err(|error| IpcError::browser_unavailable(&error))?;
        reporting.settle_sent();
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn copy_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || {
        let report = app.state::<CrashReporting>().offered()?;
        app.clipboard()
            .write_text(report.to_string())
            .map_err(|error| IpcError::clipboard_unavailable(&error))
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn decline_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || app.state::<CrashReporting>().settle()).await
}

async fn off_the_runtime<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, IpcError> + Send + 'static,
) -> Result<T, IpcError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| IpcError::internal(&error))?
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
