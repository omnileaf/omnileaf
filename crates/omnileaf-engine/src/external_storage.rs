use std::path::{Path, PathBuf};

use crate::Storage;

const NETWORK_FILE_SYSTEMS: &[&str] = &[
    "9p",
    "afpfs",
    "ceph",
    "cifs",
    "davfs",
    "fuse.davfs",
    "fuse.gvfsd-fuse",
    "fuse.rclone",
    "fuse.sshfs",
    "glusterfs",
    "ncpfs",
    "nfs",
    "nfs4",
    "smb3",
    "smbfs",
    "sshfs",
];
const REMOVABLE_MEDIA_FOLDERS: &[&str] = &["/media", "/run/media"];
const WINDOWS_SHARE_PREFIX: &str = r"\\";
const WINDOWS_VERBATIM_SHARE_PREFIX: &str = r"\\?\UNC\";
const WINDOWS_VERBATIM_PREFIX: &str = r"\\?\";
const WINDOWS_DEVICE_PREFIX: &str = r"\\.\";

struct Mount<'a> {
    point: PathBuf,
    file_system: &'a str,
}

impl Mount<'_> {
    fn is_external(&self) -> bool {
        NETWORK_FILE_SYSTEMS.contains(&self.file_system)
            || REMOVABLE_MEDIA_FOLDERS
                .iter()
                .any(|folder| self.point.starts_with(folder) && self.point != Path::new(folder))
    }
}

/// Reads one line of a mountinfo table, whose fields after the mount point end in `- type source options`.
fn mount_in(line: &str) -> Option<Mount<'_>> {
    let mut fields = line.split(' ');
    let point = fields.nth(4)?;
    let file_system = fields.skip_while(|field| *field != "-").nth(1)?;
    Some(Mount {
        point: PathBuf::from(unescape_mount_point(point)),
        file_system,
    })
}

fn unescape_mount_point(point: &str) -> String {
    point
        .replace("\\040", " ")
        .replace("\\011", "\t")
        .replace("\\012", "\n")
        .replace("\\134", "\\")
}

/// Finds the file system holding `folder`, an absolute path with its links resolved, in a Linux `/proc/self/mountinfo`.
#[must_use]
pub fn storage_in_mountinfo(mountinfo: &str, folder: &Path) -> Storage {
    let holding = mountinfo
        .lines()
        .filter_map(mount_in)
        .filter(|mount| folder.starts_with(&mount.point))
        .max_by_key(|mount| mount.point.components().count());
    match holding {
        Some(mount) if mount.is_external() => Storage::External,
        Some(_) | None => Storage::Local,
    }
}

#[must_use]
pub fn storage_of_windows_path(path: &str) -> Storage {
    let is_share = path.starts_with(WINDOWS_VERBATIM_SHARE_PREFIX)
        || (path.starts_with(WINDOWS_SHARE_PREFIX)
            && !path.starts_with(WINDOWS_VERBATIM_PREFIX)
            && !path.starts_with(WINDOWS_DEVICE_PREFIX));
    if is_share {
        Storage::External
    } else {
        Storage::Local
    }
}

/// A folder on another device than every one the system starts from is external; with none of those known, it counts as local.
#[must_use]
pub fn storage_by_device(folder: u64, startup: &[u64]) -> Storage {
    if startup.is_empty() || startup.contains(&folder) {
        Storage::Local
    } else {
        Storage::External
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOUNTINFO: &str = "\
22 1 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw
23 22 259:3 / /home rw,relatime shared:2 - ext4 /dev/nvme0n1p3 rw
41 23 0:52 / /home/reader/Shared\\040Comics rw,relatime shared:30 - nfs4 nas.example.test:/comics rw
42 22 0:53 / /mnt/nas rw,relatime shared:31 - cifs //nas.example.test/manga rw
43 23 0:54 / /home/reader/remote rw,nosuid shared:32 - fuse.sshfs reader@nas.example.test:/books rw
44 22 8:17 / /media/reader/USB\\040DRIVE rw,nosuid shared:33 - vfat /dev/sdb1 rw
45 22 8:33 / /run/media/reader/CARD rw,nosuid shared:34 - exfat /dev/sdc1 rw
46 22 259:4 / /media2 rw,relatime shared:35 - ext4 /dev/nvme0n1p4 rw
";

    fn in_mountinfo(folder: &str) -> Storage {
        storage_in_mountinfo(MOUNTINFO, Path::new(folder))
    }

    #[test]
    fn counts_a_folder_on_a_disk_of_the_device_as_local() {
        assert_eq!(in_mountinfo("/home/reader/Comics"), Storage::Local);
        assert_eq!(in_mountinfo("/srv/comics"), Storage::Local);
    }

    #[test]
    fn counts_a_folder_on_a_network_share_as_external() {
        assert_eq!(in_mountinfo("/mnt/nas/Series"), Storage::External);
        assert_eq!(in_mountinfo("/home/reader/remote/manga"), Storage::External);
    }

    #[test]
    fn reads_a_mount_point_whose_name_has_a_space() {
        assert_eq!(
            in_mountinfo("/home/reader/Shared Comics/Series"),
            Storage::External
        );
    }

    #[test]
    fn counts_a_folder_on_a_drive_mounted_for_removable_media_as_external() {
        assert_eq!(
            in_mountinfo("/media/reader/USB DRIVE/Comics"),
            Storage::External
        );
        assert_eq!(in_mountinfo("/run/media/reader/CARD"), Storage::External);
    }

    #[test]
    fn keeps_a_mount_point_that_only_starts_the_same_apart() {
        assert_eq!(in_mountinfo("/media2/comics"), Storage::Local);
        assert_eq!(in_mountinfo("/mnt/nasty"), Storage::Local);
    }

    #[test]
    fn counts_a_folder_as_local_when_the_mounts_cannot_be_read() {
        assert_eq!(
            storage_in_mountinfo("not a mount table", Path::new("/mnt/nas")),
            Storage::Local
        );
    }

    #[test]
    fn counts_a_windows_network_share_as_external() {
        assert_eq!(
            storage_of_windows_path(r"\\nas\comics\Series"),
            Storage::External
        );
        assert_eq!(
            storage_of_windows_path(r"\\?\UNC\nas\comics"),
            Storage::External
        );
    }

    #[test]
    fn counts_a_windows_drive_letter_as_local() {
        assert_eq!(storage_of_windows_path(r"C:\Comics"), Storage::Local);
        assert_eq!(storage_of_windows_path(r"\\?\D:\Comics"), Storage::Local);
    }

    #[test]
    fn counts_a_folder_on_a_startup_device_as_local() {
        assert_eq!(
            storage_by_device(16_777_232, &[16_777_230, 16_777_232]),
            Storage::Local
        );
    }

    #[test]
    fn counts_a_folder_on_another_device_as_external() {
        assert_eq!(
            storage_by_device(16_777_240, &[16_777_230, 16_777_232]),
            Storage::External
        );
    }

    #[test]
    fn counts_a_folder_as_local_when_no_startup_device_is_known() {
        assert_eq!(storage_by_device(16_777_240, &[]), Storage::Local);
    }
}
