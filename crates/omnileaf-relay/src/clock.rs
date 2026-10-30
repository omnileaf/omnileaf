use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const SECONDS_PER_HOUR: i64 = 60 * 60;
pub(crate) const SECONDS_PER_DAY: i64 = 24 * SECONDS_PER_HOUR;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct UnixTime(i64);

pub trait Clock: Send + Sync {
    fn now(&self) -> UnixTime;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl UnixTime {
    #[must_use]
    pub const fn from_seconds(seconds: i64) -> Self {
        Self(seconds)
    }

    #[must_use]
    pub const fn seconds(self) -> i64 {
        self.0
    }

    #[must_use]
    pub const fn plus_seconds(self, seconds: i64) -> Self {
        Self(self.0.saturating_add(seconds))
    }

    #[must_use]
    pub const fn minus_seconds(self, seconds: i64) -> Self {
        Self(self.0.saturating_sub(seconds))
    }

    pub(crate) const fn hour(self) -> i64 {
        self.0.div_euclid(SECONDS_PER_HOUR)
    }

    pub(crate) const fn day(self) -> i64 {
        self.0.div_euclid(SECONDS_PER_DAY)
    }

    pub(crate) const fn first_hour_of_day(self) -> i64 {
        self.day() * (SECONDS_PER_DAY / SECONDS_PER_HOUR)
    }

    pub(crate) const fn start_of_day(self) -> Self {
        Self(self.day() * SECONDS_PER_DAY)
    }

    pub(crate) fn seconds_to_next_hour(self) -> u64 {
        u64::try_from(SECONDS_PER_HOUR - self.0.rem_euclid(SECONDS_PER_HOUR)).unwrap_or(0)
    }

    pub(crate) fn seconds_to_next_day(self) -> u64 {
        u64::try_from(SECONDS_PER_DAY - self.0.rem_euclid(SECONDS_PER_DAY)).unwrap_or(0)
    }
}

impl Clock for SystemClock {
    fn now(&self) -> UnixTime {
        let since_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs());
        UnixTime(i64::try_from(since_epoch).unwrap_or(i64::MAX))
    }
}
