use std::time::{SystemTime, UNIX_EPOCH};

use omnileaf_db::store::Clock;

/// The device's wall clock.
#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_unix_ms(&self) -> u64 {
        unix_ms(SystemTime::now())
    }
}

/// Saturates at the epoch for a clock set before 1970, and at `u64::MAX` past the far future.
pub(crate) fn unix_ms(now: SystemTime) -> u64 {
    match now.duration_since(UNIX_EPOCH) {
        Ok(elapsed) => u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX),
        Err(before_epoch) => {
            tracing::warn!(
                behind_ms = before_epoch.duration().as_millis(),
                "read the device clock, which is set before 1970, as the epoch"
            );
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use super::*;

    #[derive(Clone, Default)]
    struct CapturedLog(Arc<Mutex<Vec<u8>>>);

    impl io::Write for CapturedLog {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl CapturedLog {
        fn text(&self) -> String {
            String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
        }
    }

    #[test]
    fn warns_when_it_reads_a_clock_set_before_1970_as_the_epoch() {
        let log = CapturedLog::default();
        let writer = log.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_writer(move || writer.clone())
            .with_ansi(false)
            .finish();
        let before_1970 = UNIX_EPOCH - Duration::from_secs(1);

        let read = tracing::subscriber::with_default(subscriber, || unix_ms(before_1970));

        assert_eq!(read, 0);
        assert!(log.text().contains("WARN"), "log: {}", log.text());
    }
}
