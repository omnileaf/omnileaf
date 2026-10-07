//! Crashes a development build on purpose, so its crash reports can be tried out.

use std::{convert::Infallible, process, thread};

use omnileaf_engine::BuildProfile;

use crate::ipc_error::IpcError;

const PANIC_MESSAGE: &str = "a crash test in Settings › Advanced panicked on purpose";

/// The code a Rust program exits with after a panic nothing caught.
const PANIC_EXIT_CODE: i32 = 101;

/// Panics on a thread of its own and waits for it, so the panic hook has kept the report by the time this returns.
pub(crate) fn panic_in_core(build: BuildProfile) -> Result<(), IpcError> {
    refuse_outside_development(build)?;
    let panicking = thread::Builder::new()
        .name("crash-test".to_owned())
        .spawn(panic_on_purpose)
        .map_err(|error| IpcError::internal(&error))?;
    if let Ok(never) = panicking.join() {
        match never {}
    }
    Ok(())
}

/// Panics as `panic_in_core` does, then ends the process the way an uncaught panic would, leaving the report for the next launch.
pub(crate) fn crash_and_quit(build: BuildProfile) -> Result<Infallible, IpcError> {
    panic_in_core(build)?;
    process::exit(PANIC_EXIT_CODE)
}

fn refuse_outside_development(build: BuildProfile) -> Result<(), IpcError> {
    match build {
        BuildProfile::Debug => Ok(()),
        BuildProfile::Release => Err(IpcError::development_build_only()),
    }
}

#[expect(clippy::panic, reason = "a crash test panics on purpose")]
fn panic_on_purpose() -> Infallible {
    panic!("{PANIC_MESSAGE}")
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs, panic, process,
        sync::{Arc, PoisonError},
    };

    use omnileaf_engine::{BuildProfile, CrashOrigin, CrashReportFile, CrashReportOffers};

    use super::{crash_and_quit, panic_in_core};
    use crate::{
        crash_reporting::{
            CrashReporting, Reporter, set_panic_hook,
            tests::{PANIC_HOOK, sample_app},
        },
        ipc_error::IpcError,
    };

    fn report_file(name: &str) -> (std::path::PathBuf, CrashReportFile) {
        let folder = env::temp_dir().join(format!("omnileaf-{name}-{}", process::id()));
        let file = CrashReportFile::in_folder(&folder);
        (folder, file)
    }

    #[test]
    fn refuses_to_panic_in_a_release_build() {
        let _hook = PANIC_HOOK.lock().unwrap_or_else(PoisonError::into_inner);
        let (folder, file) = report_file("release-panic");
        set_panic_hook(file.clone(), Arc::new(Reporter::new(&sample_app())));

        let outcome = panic_in_core(BuildProfile::Release);

        drop(panic::take_hook());
        let saved = file.load().unwrap();
        let _ = fs::remove_dir_all(&folder);
        assert_eq!(outcome.err(), Some(IpcError::development_build_only()));
        assert!(saved.is_none(), "a release build kept a crash report");
    }

    #[test]
    fn refuses_to_crash_and_quit_in_a_release_build() {
        let outcome = crash_and_quit(BuildProfile::Release);

        assert_eq!(outcome.err(), Some(IpcError::development_build_only()));
    }

    #[test]
    fn a_panic_in_the_core_leaves_a_report_the_next_offer_returns() {
        let _hook = PANIC_HOOK.lock().unwrap_or_else(PoisonError::into_inner);
        let (folder, file) = report_file("core-panic");
        let reporter = Arc::new(Reporter::new(&sample_app()));
        set_panic_hook(file.clone(), Arc::clone(&reporter));
        let reporting = CrashReporting {
            offers: CrashReportOffers::new(file),
            reporter,
        };

        let outcome = panic_in_core(BuildProfile::Debug);

        drop(panic::take_hook());
        let offer = reporting.offer_saved().unwrap();
        let _ = fs::remove_dir_all(&folder);
        assert_eq!(outcome, Ok(()));
        let offer = offer.expect("no crash report was offered");
        assert_eq!(offer.origin, CrashOrigin::Panic);
        assert!(
            offer.details.contains("Panic: a crash test"),
            "{}",
            offer.details
        );
    }
}
