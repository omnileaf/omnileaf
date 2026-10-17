use std::{io, path::PathBuf};

use omnileaf_engine::{ResourceRouter, StorageUse, VolumeSpace, database_bytes};

pub(crate) struct StoragePlaces {
    pub(crate) database_folder: PathBuf,
}

struct Measured {
    volume: VolumeSpace,
    database_bytes: u64,
}

impl StoragePlaces {
    pub(crate) async fn use_after_making_room(
        &self,
        resources: &ResourceRouter,
    ) -> io::Result<StorageUse> {
        let mut measured = self.measure().await?;
        if measured.volume.is_low() {
            resources.make_room(measured.volume.room_wanted()).await;
            measured = self.measure().await?;
        }
        let caches = resources.cache_sizes().await;
        Ok(StorageUse::new(
            caches,
            measured.database_bytes,
            measured.volume,
        ))
    }

    async fn measure(&self) -> io::Result<Measured> {
        let folder = self.database_folder.clone();
        tauri::async_runtime::spawn_blocking(move || {
            Ok(Measured {
                volume: volume_space(&folder)?,
                database_bytes: database_bytes(&folder),
            })
        })
        .await
        .map_err(io::Error::other)?
    }
}

#[cfg(unix)]
fn volume_space(folder: &std::path::Path) -> io::Result<VolumeSpace> {
    let stats = rustix::fs::statvfs(folder)?;
    Ok(VolumeSpace {
        free_bytes: stats.f_bavail.saturating_mul(stats.f_frsize),
        total_bytes: stats.f_blocks.saturating_mul(stats.f_frsize),
    })
}

#[cfg(windows)]
fn volume_space(folder: &std::path::Path) -> io::Result<VolumeSpace> {
    let space = omnileaf_windows_probes::disk_space(&folder.to_string_lossy())
        .ok_or_else(|| io::Error::other(format!("read the space on {}", folder.display())))?;
    Ok(VolumeSpace {
        free_bytes: space.free_bytes,
        total_bytes: space.total_bytes,
    })
}

#[cfg(test)]
mod tests {
    use std::env;

    use super::*;

    #[test]
    fn reads_the_space_of_the_volume_holding_a_folder() {
        let space = volume_space(&env::temp_dir()).unwrap();

        assert!(space.total_bytes > 0 && space.free_bytes <= space.total_bytes);
    }

    #[test]
    fn fails_to_read_the_space_of_a_folder_that_is_not_there() {
        let missing = env::temp_dir().join("omnileaf-no-such-folder-for-space");

        assert!(volume_space(&missing).is_err());
    }
}
