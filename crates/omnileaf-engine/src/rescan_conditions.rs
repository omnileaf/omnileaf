use std::{path::Path, time::Duration};

/// How long a folder on this device's own storage waits for its next scheduled rescan.
pub const RESCAN_EVERY: Duration = Duration::from_mins(5);
/// How long a folder on external storage waits, so its drive can sleep in between.
pub const EXTERNAL_RESCAN_EVERY: Duration = Duration::from_mins(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Storage {
    Local,
    /// A drive that can be unplugged or a network share, rather than the storage the device starts from.
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

/// What the device reports about where a folder is stored, read when the schedule first lists a folder and after each rescan that reads it.
pub trait RescanConditions: Send + Sync + 'static {
    fn storage_of(&self, folder: &Path) -> Storage;
}
