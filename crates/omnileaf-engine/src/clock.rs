use std::time::{SystemTime, UNIX_EPOCH};

use omnileaf_db::store::Clock;

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_unix_ms(&self) -> u64 {
        unix_ms(SystemTime::now())
    }
}

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
    use std::time::Duration;

    use super::*;
    use crate::captured_log::CapturedLog;

    #[test]
    fn warns_when_it_reads_a_clock_set_before_1970_as_the_epoch() {
        let log = CapturedLog::default();
        let before_1970 = UNIX_EPOCH - Duration::from_secs(1);

        let read = tracing::subscriber::with_default(log.subscriber(), || unix_ms(before_1970));

        assert_eq!(read, 0);
        assert!(log.text().contains("WARN"), "log: {}", log.text());
    }
}
