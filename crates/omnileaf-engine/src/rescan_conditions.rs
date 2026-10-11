use std::{path::Path, time::Duration};

pub const RESCAN_EVERY: Duration = Duration::from_mins(5);
/// Long enough that an external drive can sleep between rescans.
pub const EXTERNAL_RESCAN_EVERY: Duration = Duration::from_mins(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Storage {
    Local,
    External,
}

impl Storage {
    #[must_use]
    pub fn rescan_every(self) -> Duration {
        match self {
            Self::Local => RESCAN_EVERY,
            Self::External => EXTERNAL_RESCAN_EVERY,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerMode {
    Normal,
    /// Low Power Mode, Battery Saver or the power saver profile, whichever the device has.
    Saving,
}

pub trait RescanConditions: Send + Sync {
    fn storage_of(&self, folder: &Path) -> impl Future<Output = Storage> + Send;
    fn power_mode(&self) -> impl Future<Output = PowerMode> + Send;
}
