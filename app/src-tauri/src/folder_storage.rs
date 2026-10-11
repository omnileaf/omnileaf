use std::path::Path;

use omnileaf_engine::Storage;

#[cfg(target_os = "linux")]
const MOUNT_TABLE: &str = "/proc/self/mountinfo";

#[cfg(target_os = "macos")]
const STARTUP_VOLUMES: [&str; 2] = ["/", "/System/Volumes/Data"];

#[cfg(target_os = "linux")]
pub(crate) fn storage_of(folder: &Path) -> Storage {
    let Ok(mountinfo) = std::fs::read_to_string(MOUNT_TABLE) else {
        return Storage::Local;
    };
    let resolved = folder
        .canonicalize()
        .unwrap_or_else(|_| folder.to_path_buf());
    omnileaf_engine::storage_in_mountinfo(&mountinfo, &resolved)
}

#[cfg(target_os = "macos")]
pub(crate) fn storage_of(folder: &Path) -> Storage {
    use std::os::unix::fs::MetadataExt;

    let Ok(metadata) = std::fs::metadata(folder) else {
        return Storage::Local;
    };
    let startup: Vec<u64> = STARTUP_VOLUMES
        .iter()
        .filter_map(|volume| std::fs::metadata(volume).ok())
        .map(|volume| volume.dev())
        .collect();
    omnileaf_engine::storage_by_device(metadata.dev(), &startup)
}

#[cfg(windows)]
pub(crate) fn storage_of(folder: &Path) -> Storage {
    omnileaf_engine::storage_of_windows_path(&folder.to_string_lossy())
}

#[cfg(any(target_os = "ios", target_os = "android"))]
pub(crate) fn storage_of(_folder: &Path) -> Storage {
    Storage::Local
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_a_folder_on_the_startup_disk_as_local() {
        let folder = std::env::temp_dir();

        let storage = storage_of(&folder);

        assert_eq!(storage, Storage::Local);
    }
}
