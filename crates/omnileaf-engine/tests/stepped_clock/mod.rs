use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use omnileaf_engine::Clock;

use crate::support::NOW_UNIX_MS;

#[derive(Clone)]
pub(crate) struct SteppedClock(Arc<AtomicU64>);

impl SteppedClock {
    pub(crate) fn new() -> Self {
        Self(Arc::new(AtomicU64::new(NOW_UNIX_MS)))
    }

    pub(crate) fn advance(&self, by: Duration) {
        let by_ms = u64::try_from(by.as_millis()).unwrap();
        self.0.fetch_add(by_ms, Ordering::SeqCst);
    }
}

impl Clock for SteppedClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}
