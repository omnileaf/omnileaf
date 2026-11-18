use std::{
    cell::RefCell,
    io,
    sync::{Arc, Mutex, MutexGuard, Once, PoisonError},
};

const WARNING_MARK: &str = " WARN ";

thread_local! {
    static CAPTURING: RefCell<Option<CapturedLog>> = const { RefCell::new(None) };
}

static EVENTS_ROUTED_TO_CAPTURES: Once = Once::new();

#[derive(Clone, Default)]
pub struct CapturedLog(Arc<Mutex<Vec<u8>>>);

pub struct Capturing {
    previous: Option<CapturedLog>,
}

struct ThisThreadsCapture;

impl io::Write for ThisThreadsCapture {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        CAPTURING.with_borrow(|capturing| {
            if let Some(log) = capturing {
                log.bytes().extend_from_slice(bytes);
            }
        });
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// tracing-core caches a callsite's interest from the first thread to register it while at most one subscriber is registered, so captures share one global subscriber rather than one scoped to each test thread.
#[expect(
    clippy::panic,
    reason = "a log capture is test set-up, so a failure should stop the test"
)]
fn route_events_to_captures() {
    EVENTS_ROUTED_TO_CAPTURES.call_once(|| {
        let subscriber = tracing_subscriber::fmt()
            .with_writer(|| ThisThreadsCapture)
            .with_ansi(false)
            .finish();
        tracing::subscriber::set_global_default(subscriber)
            .unwrap_or_else(|error| panic!("route log events to captures: {error}"));
    });
    tracing::callsite::rebuild_interest_cache();
}

impl CapturedLog {
    #[must_use]
    pub fn capture(&self) -> Capturing {
        route_events_to_captures();
        let previous = CAPTURING.replace(Some(self.clone()));
        Capturing { previous }
    }

    #[must_use]
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.bytes()).into_owned()
    }

    #[must_use]
    pub fn warnings(&self) -> Vec<String> {
        self.text()
            .lines()
            .filter(|line| line.contains(WARNING_MARK))
            .map(str::to_owned)
            .collect()
    }

    fn bytes(&self) -> MutexGuard<'_, Vec<u8>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Drop for Capturing {
    fn drop(&mut self) {
        CAPTURING.set(self.previous.take());
    }
}

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;

    fn warn_that_a_save_failed() {
        tracing::warn!("a save failed");
    }

    fn inform_that_a_save_landed() {
        tracing::info!("a save landed");
    }

    #[test]
    fn captures_a_warning_whose_callsite_another_thread_met_first_without_a_log() {
        let log = CapturedLog::default();
        let _capturing = log.capture();
        let other_thread = thread::spawn(warn_that_a_save_failed).join();

        warn_that_a_save_failed();

        assert!(other_thread.is_ok());
        assert_eq!(log.warnings().len(), 1, "log: {}", log.text());
    }

    #[test]
    fn keeps_out_what_another_thread_logs_while_capturing() {
        let log = CapturedLog::default();
        let _capturing = log.capture();

        let other_thread = thread::spawn(warn_that_a_save_failed).join();

        assert!(other_thread.is_ok());
        assert_eq!(log.text(), "");
    }

    #[test]
    fn picks_out_the_warnings_from_everything_logged() {
        let log = CapturedLog::default();
        let _capturing = log.capture();

        inform_that_a_save_landed();
        warn_that_a_save_failed();

        assert_eq!(
            log.warnings()
                .iter()
                .map(|line| line.ends_with("a save failed"))
                .collect::<Vec<_>>(),
            [true],
            "log: {}",
            log.text()
        );
    }
}
