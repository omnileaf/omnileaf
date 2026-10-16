use std::{
    hash::{BuildHasher, RandomState},
    io,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use omnileaf_engine::{
    Core, Library, LocalDay, LogStandIns, ProblemReport, ProblemReportPreview, RecentLog,
    ReportCode, SavedPlace, SavedProblemReport,
};
use tauri::{AppHandle, Manager};

use crate::{ipc_error::IpcError, version_details};

#[derive(Debug, Default)]
pub(crate) struct ShownProblemReport {
    shown: Mutex<Option<ProblemReport>>,
    saved: Mutex<Option<PathBuf>>,
}

impl ShownProblemReport {
    pub(crate) fn show(&self, report: ProblemReport) -> ProblemReportPreview {
        let preview = report.preview();
        *self.shown.lock().unwrap_or_else(PoisonError::into_inner) = Some(report);
        preview
    }

    fn shown(&self) -> Option<ProblemReport> {
        self.shown
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub(crate) fn last_saved(&self) -> Result<PathBuf, IpcError> {
        self.saved
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .ok_or_else(|| {
                IpcError::file_manager_unavailable(&io::Error::new(
                    io::ErrorKind::NotFound,
                    "no problem report has been saved",
                ))
            })
    }

    fn remember_saved(&self, path: PathBuf) {
        *self.saved.lock().unwrap_or_else(PoisonError::into_inner) = Some(path);
    }
}

pub(crate) async fn gather(app: &AppHandle) -> Result<ProblemReport, IpcError> {
    let stand_ins = match app.try_state::<Library>() {
        Some(library) => library.log_stand_ins().await?,
        None => LogStandIns::default(),
    };
    let app_info = app.state::<Core>().app_info().clone();
    let details = tauri::async_runtime::spawn_blocking(move || version_details::current(app_info))
        .await
        .map_err(|error| IpcError::internal(&error))?;
    let log = stand_ins.clean_log(&app.state::<RecentLog>().lines());
    Ok(ProblemReport::new(random_code(), details, log))
}

pub(crate) async fn shown_or_gathered(app: &AppHandle) -> Result<ProblemReport, IpcError> {
    match app.state::<ShownProblemReport>().shown() {
        Some(report) => Ok(report),
        None => gather(app).await,
    }
}

pub(crate) fn save(
    app: &AppHandle,
    report: &ProblemReport,
    today: LocalDay,
) -> Result<SavedProblemReport, IpcError> {
    let (folder, place) = report_folder(app).map_err(|error| IpcError::report_not_saved(&error))?;
    let path = report
        .save_in(&folder, today)
        .map_err(|error| IpcError::report_not_saved(&error))?;
    let file = file_name_of(&path);
    app.state::<ShownProblemReport>().remember_saved(path);
    Ok(SavedProblemReport { place, file })
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(desktop)]
fn report_folder(app: &AppHandle) -> io::Result<(PathBuf, SavedPlace)> {
    let folder = app.path().download_dir().map_err(io::Error::other)?;
    let home = app.path().home_dir().ok();
    let shown =
        omnileaf_engine::folder_shown(&folder, home.as_deref(), omnileaf_engine::Platform::CURRENT);
    Ok((folder, SavedPlace::Folder { folder: shown }))
}

/// The Files app shows the app's documents folder as On My iPhone › Omnileaf.
#[cfg(target_os = "ios")]
fn report_folder(app: &AppHandle) -> io::Result<(PathBuf, SavedPlace)> {
    const REPORTS_FOLDER: &str = "Reports";
    let folder = app
        .path()
        .document_dir()
        .map_err(io::Error::other)?
        .join(REPORTS_FOLDER);
    std::fs::create_dir_all(&folder)?;
    Ok((folder, SavedPlace::AppFiles))
}

#[cfg(target_os = "android")]
fn report_folder(_app: &AppHandle) -> io::Result<(PathBuf, SavedPlace)> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "saving a problem report isn't offered on Android yet",
    ))
}

/// `RandomState` seeds each hasher from the operating system's randomness, which is enough for a code that only needs to be unlikely to repeat.
fn random_code() -> ReportCode {
    let [first, second, third, fourth, ..] =
        RandomState::new().hash_one(SystemTime::now()).to_le_bytes();
    ReportCode::from_random(u32::from_le_bytes([first, second, third, fourth]))
}
