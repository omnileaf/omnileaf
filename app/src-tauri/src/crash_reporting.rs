//! Keeps a report of a panic for the next run.

use std::{
    backtrace::Backtrace,
    panic::{self, PanicHookInfo},
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use omnileaf_engine::{
    AppInfo, Core, CrashReport, CrashReportFile, CrashReportId, CrashedApp, PanicDetails, Platform,
    SourceLocation, is_panic_contained,
};
use tauri::{AppHandle, Manager};

const NO_MESSAGE: &str = "the panic carried no message";

/// Starts keeping reports of panics; without a folder for them, a panic leaves no report.
pub(crate) fn install(app: &AppHandle) {
    let reporter = Arc::new(Reporter::new(app.state::<Core>().app_info()));
    learn_system_off_the_main_thread(Arc::clone(&reporter));
    match report_folder(app) {
        Ok(folder) => set_panic_hook(CrashReportFile::in_folder(&folder), reporter),
        Err(error) => tracing::error!(%error, "find a folder for crash reports"),
    }
}

/// Reads the system's name while the app starts, so a panic report can include it without looking it up inside the panic hook.
fn learn_system_off_the_main_thread(reporter: Arc<Reporter>) {
    drop(tauri::async_runtime::spawn_blocking(move || {
        reporter.learn_system();
    }));
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
        if !is_panic_contained() {
            keep_for_next_run(&file, &reporter, info);
        }
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
    use std::{
        env, fs, panic, process,
        sync::{Arc, Mutex, PoisonError},
    };

    use omnileaf_engine::{AppInfo, CrashReportFile, Platform, contain_panic};

    use super::{Reporter, set_panic_hook};

    static PANIC_HOOK: Mutex<()> = Mutex::new(());

    fn sample_app() -> AppInfo {
        AppInfo {
            version: "1.2.3".to_owned(),
            platform: Platform::Linux,
            source_code: "repo.example.org/omnileaf".to_owned(),
        }
    }

    #[test]
    fn a_panic_leaves_a_report_without_its_paths_or_a_system_not_yet_known() {
        let _hook = PANIC_HOOK.lock().unwrap_or_else(PoisonError::into_inner);
        let folder = env::temp_dir().join(format!("omnileaf-panic-{}", process::id()));
        let file = CrashReportFile::in_folder(&folder);
        set_panic_hook(file.clone(), Arc::new(Reporter::new(&sample_app())));

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

    #[test]
    fn a_contained_panic_leaves_no_report() {
        let _hook = PANIC_HOOK.lock().unwrap_or_else(PoisonError::into_inner);
        let folder = env::temp_dir().join(format!("omnileaf-contained-{}", process::id()));
        let file = CrashReportFile::in_folder(&folder);
        set_panic_hook(file.clone(), Arc::new(Reporter::new(&sample_app())));

        let outcome = contain_panic(|| {
            panic!("decode a damaged page");
        });

        drop(panic::take_hook());
        let saved = file.load().unwrap();
        let _ = fs::remove_dir_all(&folder);
        assert!(outcome.is_err());
        assert!(saved.is_none(), "a contained panic was kept as a crash");
    }
}
