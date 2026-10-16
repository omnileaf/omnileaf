use std::{fs, io, path::Path};

use serde::Serialize;
use specta::Type;

use crate::library::DATABASE_FILE;

const GIB: u64 = 1024 * 1024 * 1024;
const DATABASE_SUFFIXES: [&str; 3] = ["", "-wal", "-shm"];

pub const LOW_SPACE_BYTES: u64 = 2 * GIB;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VolumeSpace {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

impl VolumeSpace {
    #[must_use]
    pub const fn is_low(self) -> bool {
        self.free_bytes < LOW_SPACE_BYTES
    }

    #[must_use]
    pub const fn room_wanted(self) -> u64 {
        LOW_SPACE_BYTES.saturating_sub(self.free_bytes)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CacheSizes {
    pub cached_pages_bytes: u64,
    pub covers_bytes: u64,
}

/// Byte counts cross as plain numbers, which hold the size of any disk exactly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StorageUse {
    #[specta(type = f64)]
    pub omnileaf_bytes: u64,
    #[specta(type = f64)]
    pub cached_pages_bytes: u64,
    #[specta(type = f64)]
    pub covers_bytes: u64,
    #[specta(type = f64)]
    pub free_bytes: u64,
    #[specta(type = f64)]
    pub total_bytes: u64,
    pub is_low: bool,
}

impl StorageUse {
    #[must_use]
    pub fn new(caches: CacheSizes, database_bytes: u64, volume: VolumeSpace) -> Self {
        Self {
            omnileaf_bytes: caches
                .cached_pages_bytes
                .saturating_add(caches.covers_bytes)
                .saturating_add(database_bytes),
            cached_pages_bytes: caches.cached_pages_bytes,
            covers_bytes: caches.covers_bytes,
            free_bytes: volume.free_bytes,
            total_bytes: volume.total_bytes,
            is_low: volume.is_low(),
        }
    }
}

#[must_use]
pub fn database_bytes(database_folder: &Path) -> u64 {
    DATABASE_SUFFIXES
        .iter()
        .map(|suffix| file_bytes(&database_folder.join(format!("{DATABASE_FILE}{suffix}"))))
        .fold(0, u64::saturating_add)
}

fn file_bytes(path: &Path) -> u64 {
    match fs::metadata(path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => 0,
        Err(error) => {
            tracing::warn!(path = %path.display(), %error, "size a database file, counted as empty");
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const MIB: u64 = 1024 * 1024;

    fn volume(free_bytes: u64) -> VolumeSpace {
        VolumeSpace {
            free_bytes,
            total_bytes: 128 * GIB,
        }
    }

    #[test]
    fn runs_low_below_two_gigabytes_free() {
        assert_eq!(
            [
                volume(LOW_SPACE_BYTES - 1).is_low(),
                volume(LOW_SPACE_BYTES).is_low()
            ],
            [true, false]
        );
    }

    #[test]
    fn wants_the_room_that_brings_free_space_back_to_two_gigabytes() {
        assert_eq!(
            [
                volume(LOW_SPACE_BYTES - 300 * MIB).room_wanted(),
                volume(LOW_SPACE_BYTES + 1).room_wanted()
            ],
            [300 * MIB, 0]
        );
    }

    #[test]
    fn counts_the_caches_and_the_database_as_omnileaf_s_own() {
        let caches = CacheSizes {
            cached_pages_bytes: 1200 * MIB,
            covers_bytes: 210 * MIB,
        };

        let used = StorageUse::new(caches, 30 * MIB, volume(GIB));

        assert_eq!(
            used,
            StorageUse {
                omnileaf_bytes: 1440 * MIB,
                cached_pages_bytes: 1200 * MIB,
                covers_bytes: 210 * MIB,
                free_bytes: GIB,
                total_bytes: 128 * GIB,
                is_low: true,
            }
        );
    }

    #[test]
    fn sizes_the_database_with_its_sidecars() {
        let folder = ScratchFolder::new("database-bytes");
        fs::write(folder.path().join("library.sqlite"), [0; 300]).unwrap();
        fs::write(folder.path().join("library.sqlite-wal"), [0; 20]).unwrap();
        fs::write(folder.path().join("cover.jpg"), [0; 999]).unwrap();

        assert_eq!(database_bytes(folder.path()), 320);
    }

    #[test]
    fn sizes_a_folder_without_a_database_as_nothing() {
        let folder = ScratchFolder::new("database-bytes-none");

        assert_eq!(database_bytes(folder.path()), 0);
    }
}
