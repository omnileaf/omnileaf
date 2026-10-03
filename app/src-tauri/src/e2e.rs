//! What end-to-end test builds use in place of system dialogs, which the tests can't drive.

use std::{env, path::PathBuf};

use tauri::{AppHandle, Manager};

const PICKED_FOLDER_VARIABLE: &str = "OMNILEAF_E2E_PICKED_FOLDER";
const CRASH_REPORT_FOLDER_VARIABLE: &str = "OMNILEAF_E2E_CRASH_REPORTS";

/// The folder that answers the platform's folder picker, which is a system dialog outside the webview.
pub(crate) struct PickedFolder(Option<PathBuf>);

impl PickedFolder {
    pub(crate) fn from_environment() -> Self {
        Self(env::var_os(PICKED_FOLDER_VARIABLE).map(PathBuf::from))
    }
}

pub(crate) fn picked_folder(app: &AppHandle) -> Option<PathBuf> {
    app.try_state::<PickedFolder>()
        .and_then(|picked| picked.0.clone())
}

/// Where test builds keep crash reports, so a report from a real run never shows up in a test.
pub(crate) struct CrashReportFolder(Option<PathBuf>);

impl CrashReportFolder {
    pub(crate) fn from_environment() -> Self {
        Self(env::var_os(CRASH_REPORT_FOLDER_VARIABLE).map(PathBuf::from))
    }
}

pub(crate) fn crash_report_folder(app: &AppHandle) -> Option<PathBuf> {
    app.try_state::<CrashReportFolder>()
        .and_then(|folder| folder.0.clone())
}
