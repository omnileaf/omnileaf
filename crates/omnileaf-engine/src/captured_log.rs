use std::{
    cell::RefCell,
    io,
    sync::{Arc, Mutex, Once},
};

thread_local! {
    static CAPTURING: RefCell<Option<CapturedLog>> = const { RefCell::new(None) };
}

static EVENTS_ROUTED_TO_CAPTURES: Once = Once::new();

#[derive(Clone, Default)]
pub(crate) struct CapturedLog(Arc<Mutex<Vec<u8>>>);

pub(crate) struct Capturing {
    previous: Option<CapturedLog>,
}

struct ThisThreadsCapture;

impl io::Write for ThisThreadsCapture {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        CAPTURING.with_borrow(|capturing| {
            if let Some(log) = capturing {
                log.0.lock().unwrap().extend_from_slice(bytes);
            }
        });
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// tracing-core caches a callsite's interest from the first thread to register it while at most one subscriber is registered, so captures share one global subscriber rather than one scoped to each test thread.
fn route_events_to_captures() {
    EVENTS_ROUTED_TO_CAPTURES.call_once(|| {
        let subscriber = tracing_subscriber::fmt()
            .with_writer(|| ThisThreadsCapture)
            .with_ansi(false)
            .finish();
        tracing::subscriber::set_global_default(subscriber).unwrap();
    });
    tracing::callsite::rebuild_interest_cache();
}

impl CapturedLog {
    pub(crate) fn capture(&self) -> Capturing {
        route_events_to_captures();
        let previous = CAPTURING.replace(Some(self.clone()));
        Capturing { previous }
    }

    pub(crate) fn text(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
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

    #[test]
    fn captures_a_warning_whose_callsite_another_thread_met_first_without_a_log() {
        let log = CapturedLog::default();
        let _capturing = log.capture();
        thread::spawn(warn_that_a_save_failed).join().unwrap();

        warn_that_a_save_failed();

        assert_eq!(
            log.text().matches(" WARN ").count(),
            1,
            "log: {}",
            log.text()
        );
    }

    #[test]
    fn keeps_out_what_another_thread_logs_while_capturing() {
        let log = CapturedLog::default();
        let _capturing = log.capture();

        thread::spawn(warn_that_a_save_failed).join().unwrap();

        assert_eq!(log.text(), "");
    }
}
