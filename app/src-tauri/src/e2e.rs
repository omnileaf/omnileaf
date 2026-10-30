use std::{env, path::PathBuf};

use tauri::{AppHandle, Manager};
#[cfg(windows)]
use tauri::{WebviewWindow, Wry, ipc::Invoke};

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

#[cfg(windows)]
pub(crate) fn with_test_hooks(
    app_commands: impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    let test_hooks = test_hooks();
    move |invoke| {
        if TEST_HOOKS.contains(&invoke.message.command()) {
            test_hooks(invoke)
        } else {
            app_commands(invoke)
        }
    }
}

macro_rules! test_hooks {
    ($($hook:ident),*) => {
        #[cfg(windows)]
        const TEST_HOOKS: &[&str] = &[$(stringify!($hook)),*];

        #[cfg(windows)]
        fn test_hooks() -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
            tauri::generate_handler![$($hook),*]
        }
    };
}

test_hooks!(window_backdrop_type);

#[cfg(windows)]
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn window_backdrop_type(window: WebviewWindow) -> Option<i32> {
    let handle = window.hwnd().ok()?.0.expose_provenance();
    omnileaf_windows_probes::system_backdrop_type(handle)
}
