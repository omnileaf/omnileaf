use std::{env, path::PathBuf};

use tauri::{AppHandle, Manager};

const PICKED_FOLDER_VARIABLE: &str = "OMNILEAF_E2E_PICKED_FOLDER";
const CRASH_REPORT_FOLDER_VARIABLE: &str = "OMNILEAF_E2E_CRASH_REPORTS";
const SINGLE_INSTANCE_VARIABLE: &str = "OMNILEAF_E2E_SINGLE_INSTANCE";

/// Test builds run one app per test beside each other, so the single-instance check applies only where a test asks for it.
pub(crate) fn wants_single_instance() -> bool {
    env::var_os(SINGLE_INSTANCE_VARIABLE).is_some()
}

/// Answers the platform's folder picker in test builds, since it is a system dialog the tests can't drive.
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
