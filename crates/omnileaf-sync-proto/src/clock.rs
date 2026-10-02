const COUNTER_BITS: u32 = 16;
const LAST_UNIX_MS: u64 = u64::MAX >> COUNTER_BITS;

/// A hybrid logical clock stamp, `unix_ms << 16 | counter`, so stamps order by time and then by counter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Hlc(u64);

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ClockError {
    #[error("{unix_ms} ms since the epoch does not fit the clock's 48-bit time")]
    OutOfRange { unix_ms: u64 },
    #[error("the clock has reached its last stamp")]
    Exhausted,
}

impl Hlc {
    pub const ZERO: Self = Self(0);

    pub fn new(unix_ms: u64, counter: u16) -> Result<Self, ClockError> {
        if unix_ms > LAST_UNIX_MS {
            return Err(ClockError::OutOfRange { unix_ms });
        }
        Ok(Self(unix_ms << COUNTER_BITS | u64::from(counter)))
    }

    #[must_use]
    pub const fn as_u64(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn unix_ms(self) -> u64 {
        self.0 >> COUNTER_BITS
    }

    /// The next local stamp: later than this one and no earlier than the wall clock, a full counter carrying into the next millisecond.
    pub fn tick(self, now_unix_ms: u64) -> Result<Self, ClockError> {
        let wall = Self::new(now_unix_ms, 0)?;
        let next = self.0.checked_add(1).ok_or(ClockError::Exhausted)?;
        Ok(Self(next).max(wall))
    }

    /// Callers validate `remote` against the corrected wall clock first, since a stamp near the end of time leaves every later tick [`ClockError::Exhausted`].
    #[must_use]
    pub fn observe(self, remote: Self) -> Self {
        self.max(remote)
    }
}

impl From<u64> for Hlc {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
