use omnileaf_engine::Clock;
pub(crate) use omnileaf_testkit::ScratchFolder;

pub(crate) const NOW_UNIX_MS: u64 = 1_790_000_000_000;

pub(crate) struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
}
