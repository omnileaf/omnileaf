use std::path::{Path, PathBuf};

use crate::ShareAddress;

const SOURCE_END: &str = " on ";
const POINT_END: &str = " (";
const OPTION_SEPARATOR: char = ',';
const HOST_END: char = ':';

struct Mounted<'a> {
    source: &'a str,
    point: PathBuf,
    file_system: &'a str,
}

pub(crate) fn share_address_in_mount_table(table: &str, folder: &Path) -> Option<ShareAddress> {
    let mounted = table
        .lines()
        .filter_map(mounted_in)
        .filter(|mounted| folder.starts_with(&mounted.point))
        .max_by_key(|mounted| mounted.point.components().count())?;
    let address = match mounted.file_system {
        "smbfs" => format!("smb:{}", mounted.source),
        "afpfs" => format!("afp:{}", mounted.source),
        "nfs" => {
            let (host, export) = mounted.source.split_once(HOST_END)?;
            format!("nfs://{host}{export}")
        }
        "webdav" => mounted.source.to_owned(),
        _ => return None,
    };
    Some(ShareAddress::new(address))
}

/// macOS's `mount` lists each mount as `source on point (type, options)`.
fn mounted_in(line: &str) -> Option<Mounted<'_>> {
    let (source, rest) = line.split_once(SOURCE_END)?;
    let (point, options) = rest.rsplit_once(POINT_END)?;
    let file_system = options.split(OPTION_SEPARATOR).next()?.trim();
    Some(Mounted {
        source,
        point: PathBuf::from(point),
        file_system,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOUNT_TABLE: &str = concat!(
        "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)\n",
        "devfs on /dev (devfs, local, nobrowse)\n",
        "/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse)\n",
        "//kai@nas._smb._tcp.test/manga on /Volumes/manga (smbfs, nodev, nosuid, mounted by kai)\n",
        "//kai@mac.test/Comics on /Volumes/Old Comics (afpfs, nodev, nosuid, mounted by kai)\n",
        "nas.test:/export/books on /Volumes/books (nfs, nodev, nosuid, mounted by kai)\n",
        "https://dav.example.test/manga on /Volumes/web (webdav, nodev, nosuid, mounted by kai)\n",
        "/dev/disk4s1 on /Volumes/Archive (exfat, local, nodev, nosuid, mounted by kai)\n",
    );

    fn address(folder: &str) -> Option<String> {
        share_address_in_mount_table(MOUNT_TABLE, Path::new(folder))
            .map(|address| address.as_str().to_owned())
    }

    #[test]
    fn signs_in_to_a_samba_or_apple_share_through_its_address() {
        assert_eq!(
            [
                address("/Volumes/manga/Series"),
                address("/Volumes/Old Comics/Series")
            ],
            [
                Some("smb://kai@nas._smb._tcp.test/manga".to_owned()),
                Some("afp://kai@mac.test/Comics".to_owned())
            ]
        );
    }

    #[test]
    fn signs_in_to_an_nfs_export_or_web_folder_through_its_address() {
        assert_eq!(
            [address("/Volumes/books"), address("/Volumes/web/Series")],
            [
                Some("nfs://nas.test/export/books".to_owned()),
                Some("https://dav.example.test/manga".to_owned())
            ]
        );
    }

    #[test]
    fn finds_no_share_for_a_folder_on_a_disk_or_drive() {
        assert_eq!(
            [
                address("/Users/kai/Comics"),
                address("/Volumes/Archive/Comics"),
                address("/Volumes/mangaka"),
            ],
            [None, None, None]
        );
    }
}
