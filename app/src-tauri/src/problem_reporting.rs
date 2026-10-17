use std::{
    hash::{BuildHasher, RandomState},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use omnileaf_engine::{
    Core, Library, LogStandIns, ProblemReport, ProblemReportPreview, RecentLog, ReportCode,
};
use tauri::{AppHandle, Manager};

use crate::{ipc_error::IpcError, version_details};

#[derive(Debug, Default)]
pub(crate) struct ShownProblemReport(Mutex<Option<ProblemReport>>);

impl ShownProblemReport {
    pub(crate) fn show(&self, report: ProblemReport) -> ProblemReportPreview {
        let preview = report.preview();
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(report);
        preview
    }

    fn shown(&self) -> Option<ProblemReport> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
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

/// `RandomState` seeds each hasher from the operating system's randomness, which is enough for a code that only needs to be unlikely to repeat.
fn random_code() -> ReportCode {
    let [first, second, third, fourth, ..] =
        RandomState::new().hash_one(SystemTime::now()).to_le_bytes();
    ReportCode::from_random(u32::from_le_bytes([first, second, third, fourth]))
}
