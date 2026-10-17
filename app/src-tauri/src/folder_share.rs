use std::path::Path;

use omnileaf_engine::{ShareLookup, UnreachableShare};

pub(crate) struct SystemShares;

impl ShareLookup for SystemShares {
    async fn unreachable_share(&self, folder: &Path) -> Option<UnreachableShare> {
        let folder = folder.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || unreachable_share(&folder))
            .await
            .ok()
            .flatten()
    }
}

#[cfg(any(target_os = "linux", windows))]
fn is_reachable(share: impl AsRef<Path>) -> bool {
    std::fs::read_dir(share).is_ok()
}

#[cfg(target_os = "linux")]
const FILE_SYSTEM_TABLE: &str = "/etc/fstab";

#[cfg(target_os = "linux")]
fn unreachable_share(folder: &Path) -> Option<UnreachableShare> {
    let mountinfo = std::fs::read_to_string(crate::folder_storage::MOUNT_TABLE).unwrap_or_default();
    let fstab = std::fs::read_to_string(FILE_SYSTEM_TABLE).unwrap_or_default();
    omnileaf_engine::unreachable_linux_share(
        folder,
        omnileaf_engine::MountTables {
            mountinfo: &mountinfo,
            fstab: &fstab,
        },
        |share| is_reachable(share),
    )
}

#[cfg(windows)]
fn unreachable_share(folder: &Path) -> Option<UnreachableShare> {
    omnileaf_engine::unreachable_windows_share(
        &folder.to_string_lossy(),
        omnileaf_windows_probes::remote_name,
        |share| is_reachable(share),
    )
}

#[cfg(not(any(target_os = "linux", windows)))]
fn unreachable_share(_folder: &Path) -> Option<UnreachableShare> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_no_share_for_a_folder_on_the_startup_disk() {
        let folder = std::env::temp_dir().join("omnileaf-gone-missing");

        let share = tauri::async_runtime::block_on(SystemShares.unreachable_share(&folder));

        assert_eq!(share, None);
    }
}
