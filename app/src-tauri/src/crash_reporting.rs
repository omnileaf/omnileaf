//! Keeps a report of a panic for the next run and offers reports to the person, who decides whether to send them.

use std::{
    backtrace::Backtrace,
    panic::{self, PanicHookInfo},
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use omnileaf_engine::{
    AppInfo, Core, CrashReport, CrashReportFile, CrashReportId, CrashReportOffers, CrashedApp,
    InterfaceError, PanicDetails, Platform, SourceLocation,
};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::ipc_error::IpcError;

const NO_MESSAGE: &str = "the panic carried no message";

/// A crash report as the interface shows it, for the person to read before deciding.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CrashReportOffer {
    details: String,
}

impl From<&CrashReport> for CrashReportOffer {
    fn from(report: &CrashReport) -> Self {
        Self {
            details: report.to_string(),
        }
    }
}

pub(crate) struct CrashReporting {
    offers: CrashReportOffers,
    reporter: Arc<Reporter>,
}

impl CrashReporting {
    /// Also learns the system's name, so a later panic report can include it without looking it up inside the panic hook.
    pub(crate) fn offer_saved(&self) -> Result<Option<CrashReportOffer>, IpcError> {
        self.reporter.learn_system();
        let saved = self.offers.offer_saved()?;
        Ok(saved.as_ref().map(CrashReportOffer::from))
    }

    pub(crate) fn offer_interface_error(&self, error: &InterfaceError) -> CrashReportOffer {
        let report = CrashReport::from_interface_error(
            Reporter::next_id(),
            self.reporter.crashed_app(),
            error,
        );
        tracing::error!(report = %report, "the interface met an error it didn't handle");
        let offered = self.offers.offer(report).unwrap_or_else(|unsaved| {
            tracing::warn!(error = ?unsaved.source, "keep the crash report for the next run");
            *unsaved.report
        });
        CrashReportOffer::from(&offered)
    }

    pub(crate) fn offered(&self) -> Result<CrashReport, IpcError> {
        self.offers.offered().ok_or_else(IpcError::no_crash_report)
    }

    pub(crate) fn settle(&self) -> Result<(), IpcError> {
        Ok(self.offers.settle()?)
    }

    /// Ends the offer of a report that has gone out; a copy left on disk only comes back next time, so it is logged rather than reported.
    pub(crate) fn settle_sent(&self) {
        if let Err(error) = self.offers.settle() {
            tracing::warn!(error = ?error, "remove the crash report that was sent");
        }
    }
}

/// Starts keeping reports of panics, and offers them through the app's state; without a folder for them, reports last only for this run.
pub(crate) fn install(app: &AppHandle) {
    let reporter = Arc::new(Reporter::new(app.state::<Core>().app_info()));
    let offers = match report_folder(app) {
        Ok(folder) => {
            let file = CrashReportFile::in_folder(&folder);
            set_panic_hook(file.clone(), Arc::clone(&reporter));
            CrashReportOffers::new(file)
        }
        Err(error) => {
            tracing::error!(%error, "find a folder for crash reports");
            CrashReportOffers::in_memory()
        }
    };
    app.manage(CrashReporting { offers, reporter });
}

fn report_folder(app: &AppHandle) -> tauri::Result<PathBuf> {
    #[cfg(all(desktop, feature = "e2e"))]
    if let Some(folder) = crate::e2e::crash_report_folder(app) {
        return Ok(folder);
    }
    app.path().app_local_data_dir()
}

/// Describes the running app in a report, reading the system's name once, outside any panic.
pub(crate) struct Reporter {
    version: String,
    platform: Platform,
    system: OnceLock<Option<String>>,
}

impl Reporter {
    pub(crate) fn new(app: &AppInfo) -> Self {
        Self {
            version: app.version.clone(),
            platform: app.platform,
            system: OnceLock::new(),
        }
    }

    fn next_id() -> CrashReportId {
        let since_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        CrashReportId::from_millis(u64::try_from(since_epoch.as_millis()).unwrap_or(u64::MAX))
    }

    fn learn_system(&self) -> Option<&String> {
        self.system
            .get_or_init(crate::version_details::system)
            .as_ref()
    }

    fn crashed_app(&self) -> CrashedApp {
        self.crashed_app_with(self.learn_system())
    }

    fn crashed_app_while_panicking(&self) -> CrashedApp {
        self.crashed_app_with(self.system.get().and_then(Option::as_ref))
    }

    fn crashed_app_with(&self, system: Option<&String>) -> CrashedApp {
        CrashedApp {
            version: self.version.clone(),
            platform: self.platform,
            system: system.cloned(),
        }
    }
}

fn set_panic_hook(file: CrashReportFile, reporter: Arc<Reporter>) {
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        keep_for_next_run(&file, &reporter, info);
        previous(info);
    }));
}

fn keep_for_next_run(file: &CrashReportFile, reporter: &Reporter, info: &PanicHookInfo<'_>) {
    let backtrace = Backtrace::force_capture().to_string();
    let panic = PanicDetails {
        message: info.payload_as_str().unwrap_or(NO_MESSAGE),
        location: info.location().map(|location| SourceLocation {
            file: location.file(),
            line: location.line(),
            column: location.column(),
        }),
        backtrace: &backtrace,
    };
    let report = CrashReport::from_panic(
        Reporter::next_id(),
        reporter.crashed_app_while_panicking(),
        &panic,
    );
    if let Err(error) = file.save(&report) {
        tracing::error!(error = ?error, "keep the crash report for the next run");
    }
}

#[cfg(test)]
mod tests {
    use std::{env, fs, panic, process, sync::Arc};

    use omnileaf_engine::{AppInfo, CrashReportFile, Platform};

    use super::{Reporter, set_panic_hook};

    #[test]
    fn a_panic_leaves_a_report_without_its_paths_or_a_system_not_yet_known() {
        let folder = env::temp_dir().join(format!("omnileaf-panic-{}", process::id()));
        let file = CrashReportFile::in_folder(&folder);
        let app = AppInfo {
            version: "1.2.3".to_owned(),
            platform: Platform::Linux,
            source_code: "repo.example.org/omnileaf".to_owned(),
        };
        set_panic_hook(file.clone(), Arc::new(Reporter::new(&app)));

        let outcome = panic::catch_unwind(|| {
            panic!("open /home/sample-user/Sample Series 01.cbz");
        });

        drop(panic::take_hook());
        let saved = file.load().unwrap();
        let _ = fs::remove_dir_all(&folder);
        assert!(outcome.is_err());
        assert!(saved.is_some(), "no report was kept");
        let report = saved.map(|saved| saved.to_string()).unwrap_or_default();
        assert!(report.starts_with("Omnileaf 1.2.3 on Linux\n"), "{report}");
        assert!(report.contains("\nPanic: open <path>\n"), "{report}");
        assert!(
            report.contains("a_panic_leaves_a_report_without_its_paths"),
            "{report}"
        );
        assert!(!report.contains("sample-user"), "{report}");
        assert!(!report.contains("Sample Series"), "{report}");
    }
}
