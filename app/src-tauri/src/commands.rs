#[cfg(debug_assertions)]
use omnileaf_engine::BuildProfile;
use omnileaf_engine::{
    AppInfo, AppLanguage, BooksRemoval, Core, CoversPerRow, FolderCursor, FolderId, FolderPage,
    FolderRescan, FolderScan, InterfaceError, Library, LibraryView, ProjectLink, ScanProgress,
    SeriesCursor, SeriesPage,
};
use tauri::{AppHandle, Manager, State, Wry, ipc::Channel};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tauri_specta::{Builder, Commands, collect_commands, collect_events};

#[cfg(debug_assertions)]
use crate::crash_reporting::developer_crashes;
use crate::{
    crash_reporting::{CrashReportOffer, CrashReporting},
    folder_picker::pick_folder,
    ipc_error::IpcError,
    library_events::LibraryChanged,
    library_problem::{LibraryAtLaunch, LibraryProblem},
    system_bars::{self, Theme, ThemePreference},
    version_details,
};

macro_rules! app_commands {
    ($($development_only:ident),*) => {
        collect_commands![
            app_info,
            library_problem,
            add_library_folder,
            match_system_bars,
            library_folders,
            library_series,
            library_series_count,
            library_view,
            set_library_view,
            remove_library_folder,
            library_folder_book_count,
            rescan_library_folder,
            rescan_library_folders,
            remove_books_of_emptied_folder,
            put_back_removed_books,
            first_launch_finished,
            finish_first_launch,
            set_app_language,
            copy_version_details,
            open_project_link,
            offer_saved_crash_report,
            offer_interface_error_report,
            send_crash_report,
            copy_crash_report,
            decline_crash_report,
            $($development_only),*
        ]
    };
}

pub(crate) fn builder() -> Builder<Wry> {
    Builder::new()
        .commands(registered_commands())
        .events(collect_events![LibraryChanged])
        .constant("COVERS_PER_ROW", CoversPerRow::RANGES)
        .constant("DEFAULT_LIBRARY_VIEW", LibraryView::default())
}

/// Development builds add the commands that crash on purpose; release builds leave them out, though the bindings, generated from a development build, still list them.
#[cfg(debug_assertions)]
fn registered_commands() -> Commands<Wry> {
    app_commands![panic_in_core, crash_and_quit]
}

#[cfg(not(debug_assertions))]
fn registered_commands() -> Commands<Wry> {
    app_commands![]
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
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn library_problem(launch: State<'_, LibraryAtLaunch>) -> Option<LibraryProblem> {
    launch.problem
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
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
    id: FolderId,
    on_progress: Channel<ScanProgress>,
) -> Result<FolderRescan, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.rescan_folder(id, reporting_to(on_progress)).await?)
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_folders(
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
) -> Result<Vec<FolderRescan>, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.rescan_folders().await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_books_of_emptied_folder(
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
    id: FolderId,
) -> Result<BooksRemoval, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.remove_books_of_emptied_folder(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn put_back_removed_books(
    library: State<'_, Library>,
    id: FolderId,
) -> Result<bool, IpcError> {
    Ok(library.put_back_removed_books(id).await?)
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
async fn library_series(
    library: State<'_, Library>,
    after: Option<SeriesCursor>,
) -> Result<SeriesPage, IpcError> {
    Ok(library.series(after).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_series_count(library: State<'_, Library>) -> Result<u32, IpcError> {
    Ok(library.series_count().await?)
}

#[tauri::command]
#[specta::specta]
async fn library_view(library: State<'_, Library>) -> Result<LibraryView, IpcError> {
    Ok(library.view().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_library_view(library: State<'_, Library>, view: LibraryView) -> Result<(), IpcError> {
    Ok(library.set_view(view).await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_library_folder(library: State<'_, Library>, id: FolderId) -> Result<(), IpcError> {
    Ok(library.remove_folder(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_folder_book_count(
    library: State<'_, Library>,
    id: FolderId,
) -> Result<u32, IpcError> {
    Ok(library.folder_book_count(id).await?)
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

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
async fn panic_in_core() -> Result<(), IpcError> {
    off_the_runtime(|| developer_crashes::panic_in_core(BuildProfile::CURRENT)).await
}

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
async fn crash_and_quit() -> Result<(), IpcError> {
    off_the_runtime(|| {
        developer_crashes::crash_and_quit(BuildProfile::CURRENT).map(|quit| match quit {})
    })
    .await
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
