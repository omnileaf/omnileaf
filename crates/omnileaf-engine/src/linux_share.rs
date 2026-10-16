use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

use crate::{
    NetworkShare, ShareAddress, ShareSignIn, UnreachableShare,
    external_storage::{Mount, NETWORK_FILE_SYSTEMS, mount_in, unescape_mount_point},
};

const RUNTIME_FOLDERS: [&str; 2] = ["run", "user"];
const GVFS_FOLDER: &str = "gvfs";
const KIO_FUSE_PREFIX: &str = "kio-fuse-";
const GVFS_FILE_SYSTEM: &str = "fuse.gvfsd-fuse";
const AUTOMOUNTER_FILE_SYSTEM: &str = "autofs";
const FSTAB_COMMENT: char = '#';
const SPEC_TYPE_END: char = ':';
const SPEC_KEY_SEPARATOR: char = ',';
const SPEC_VALUE_START: char = '=';
const ESCAPE: u8 = b'%';
const ESCAPED_SLASH: [&str; 2] = ["%2F", "%2f"];
const USER_END: char = '@';
const HEX: u32 = 16;
const SESSION_MOUNTS_DEPTH: usize = 5;

#[derive(Clone, Copy, Debug)]
pub struct MountTables<'a> {
    pub mountinfo: &'a str,
    pub fstab: &'a str,
}

struct ShareAt {
    root: PathBuf,
    share: UnreachableShare,
}

#[must_use]
pub fn unreachable_linux_share(
    folder: &Path,
    tables: MountTables<'_>,
    mut is_reachable: impl FnMut(&Path) -> bool,
) -> Option<UnreachableShare> {
    if let Some(at) = session_share(folder) {
        return (!is_reachable(&at.root)).then_some(at.share);
    }
    let mounted = deepest_holding(tables.mountinfo.lines().filter_map(mount_in), folder);
    let listed = deepest_holding(
        tables
            .fstab
            .lines()
            .filter_map(fstab_entry)
            .filter(is_network_share),
        folder,
    );
    match mounted {
        Some(mount) if mount.file_system == AUTOMOUNTER_FILE_SYSTEM => {
            Some(mounted_by_system(listed.map_or_else(
                || NetworkShare::from_mount_point(&mount.point),
                |entry| NetworkShare::from_mount_source(entry.source),
            )))
        }
        Some(mount) if is_network_share(&mount) => (!is_reachable(&mount.point))
            .then(|| mounted_by_system(NetworkShare::from_mount_source(mount.source))),
        mounted => listed
            .filter(|entry| {
                mounted.as_ref().is_none_or(|mount| {
                    entry.point != mount.point && entry.point.starts_with(&mount.point)
                })
            })
            .map(|entry| mounted_by_system(NetworkShare::from_mount_source(entry.source))),
    }
}

fn mounted_by_system(share: NetworkShare) -> UnreachableShare {
    UnreachableShare {
        share,
        sign_in: ShareSignIn::MountedBySystem,
    }
}

fn is_network_share(mount: &Mount<'_>) -> bool {
    mount.file_system != GVFS_FILE_SYSTEM && NETWORK_FILE_SYSTEMS.contains(&mount.file_system)
}

fn deepest_holding<'a>(
    mounts: impl Iterator<Item = Mount<'a>>,
    folder: &Path,
) -> Option<Mount<'a>> {
    mounts
        .filter(|mount| folder.starts_with(&mount.point))
        .max_by_key(|mount| mount.point.components().count())
}

fn fstab_entry(line: &str) -> Option<Mount<'_>> {
    let line = line.trim_start();
    if line.starts_with(FSTAB_COMMENT) {
        return None;
    }
    let mut fields = line.split_whitespace();
    let source = fields.next()?;
    let point = fields.next()?;
    let file_system = fields.next()?;
    Some(Mount {
        point: PathBuf::from(unescape_mount_point(point)),
        file_system,
        source,
    })
}

fn session_share(folder: &Path) -> Option<ShareAt> {
    let mut components = folder.components();
    if components.next() != Some(Component::RootDir) {
        return None;
    }
    let names: Vec<&str> = components
        .map(|component| match component {
            Component::Normal(name) => name.to_str(),
            Component::Prefix(_)
            | Component::RootDir
            | Component::CurDir
            | Component::ParentDir => None,
        })
        .collect::<Option<_>>()?;
    let [run, user, uid, session_mounts, inside @ ..] = names.as_slice() else {
        return None;
    };
    let is_session_folder =
        [*run, *user] == RUNTIME_FOLDERS && uid.chars().all(|digit| digit.is_ascii_digit());
    if !is_session_folder {
        return None;
    }
    let (depth, share) = if *session_mounts == GVFS_FOLDER {
        gvfs_share(inside)?
    } else if session_mounts.starts_with(KIO_FUSE_PREFIX) {
        kio_fuse_share(inside)?
    } else {
        return None;
    };
    Some(ShareAt {
        root: folder
            .components()
            .take(SESSION_MOUNTS_DEPTH + depth)
            .collect(),
        share,
    })
}

fn gvfs_share(inside: &[&str]) -> Option<(usize, UnreachableShare)> {
    let (kind, keys) = inside.first()?.split_once(SPEC_TYPE_END)?;
    let keys: BTreeMap<&str, &str> = keys
        .split(SPEC_KEY_SEPARATOR)
        .filter_map(|pair| pair.split_once(SPEC_VALUE_START))
        .collect();
    let key = |name: &str| keys.get(name).copied();
    let user = key("user")
        .map(|user| format!("{user}{USER_END}"))
        .unwrap_or_default();
    let port = key("port")
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let prefix = key("prefix").unwrap_or_default();
    let prefix_path = ESCAPED_SLASH
        .iter()
        .fold(prefix.to_owned(), |path, slash| path.replace(slash, "/"));
    let (address, share) = match kind {
        "smb-share" => {
            let (server, share) = (key("server")?, key("share")?);
            let domain = key("domain")
                .map(|domain| format!("{domain};"))
                .unwrap_or_default();
            (
                format!("smb://{domain}{user}{server}/{share}"),
                NetworkShare::on(&unescaped(server), &unescaped(share)),
            )
        }
        "sftp" | "ftp" => {
            let host = key("host")?;
            (
                format!("{kind}://{user}{host}{port}/"),
                NetworkShare::on(&unescaped(host), ""),
            )
        }
        "dav" => {
            let host = key("host")?;
            let scheme = if key("ssl") == Some("true") {
                "davs"
            } else {
                "dav"
            };
            (
                format!("{scheme}://{user}{host}{port}{prefix_path}"),
                NetworkShare::on(&unescaped(host), &unescaped(prefix)),
            )
        }
        "afp-volume" => {
            let (host, volume) = (key("host")?, key("volume")?);
            (
                format!("afp://{user}{host}/{volume}"),
                NetworkShare::on(&unescaped(host), &unescaped(volume)),
            )
        }
        "nfs" => {
            let host = key("host")?;
            (
                format!("nfs://{host}{prefix_path}"),
                NetworkShare::on(&unescaped(host), &unescaped(prefix)),
            )
        }
        _ => return None,
    };
    Some((
        1,
        UnreachableShare {
            share,
            sign_in: ShareSignIn::System(ShareAddress::new(address)),
        },
    ))
}

fn kio_fuse_share(inside: &[&str]) -> Option<(usize, UnreachableShare)> {
    let [_protocol, host, share @ ..] = inside else {
        return None;
    };
    let server = host
        .rsplit_once(USER_END)
        .map_or(*host, |(_, server)| server);
    let share = share.first().copied();
    Some((
        2 + usize::from(share.is_some()),
        mounted_by_system(NetworkShare::on(server, share.unwrap_or_default())),
    ))
}

fn unescaped(escaped: &str) -> String {
    let mut bytes = Vec::with_capacity(escaped.len());
    let mut rest = escaped.as_bytes();
    while let Some((&byte, after)) = rest.split_first() {
        let value = (byte == ESCAPE)
            .then(|| after.get(..2))
            .flatten()
            .and_then(|hex| std::str::from_utf8(hex).ok())
            .and_then(|hex| u8::from_str_radix(hex, HEX).ok());
        if let Some(value) = value {
            bytes.push(value);
            rest = after.get(2..).unwrap_or_default();
        } else {
            bytes.push(byte);
            rest = after;
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use crate::{NetworkShare, ShareAddress, ShareSignIn};

    use super::*;

    const MOUNTINFO: &str = concat!(
        "22 1 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw\n",
        "23 22 259:3 / /home rw,relatime shared:2 - ext4 /dev/nvme0n1p3 rw\n",
        "51 25 0:48 / /run/user/1000/gvfs rw,nosuid shared:40 - fuse.gvfsd-fuse gvfsd-fuse rw\n",
        "52 25 0:49 / /run/user/1000/kio-fuse-AbCdEf rw shared:41 - fuse.kio-fuse kio-fuse rw\n",
        "53 22 0:50 / /mnt/films rw,relatime shared:42 - cifs //nas/films rw\n",
        "54 22 0:51 / /mnt/auto rw,relatime shared:43 - autofs systemd-1 rw,fd=50\n",
        "55 22 0:52 / /media/reader/Archive rw,nosuid shared:44 - exfat /dev/sdb1 rw\n",
    );
    const FSTAB: &str = concat!(
        "# <file system> <mount point> <type> <options> <dump> <pass>\n",
        "UUID=0a1b2c3d / ext4 defaults 0 1\n",
        "//nas/manga /mnt/manga cifs credentials=/etc/nas,noauto 0 0\n",
        "nas:/export/comics /srv/shared\\040comics nfs4 defaults 0 0\n",
        "//nas/auto /mnt/auto cifs x-systemd.automount 0 0\n",
    );
    const TABLES: MountTables<'static> = MountTables {
        mountinfo: MOUNTINFO,
        fstab: FSTAB,
    };

    fn unreachable(folder: &str) -> Option<UnreachableShare> {
        unreachable_linux_share(Path::new(folder), TABLES, |_| false)
    }

    fn share(server: &str, name: &str) -> NetworkShare {
        NetworkShare {
            server: server.to_owned(),
            name: name.to_owned(),
        }
    }

    fn signed_in_at(address: &str, server: &str, name: &str) -> UnreachableShare {
        UnreachableShare {
            share: share(server, name),
            sign_in: ShareSignIn::System(ShareAddress::new(address.to_owned())),
        }
    }

    fn mounted_by_system(server: &str, name: &str) -> UnreachableShare {
        UnreachableShare {
            share: share(server, name),
            sign_in: ShareSignIn::MountedBySystem,
        }
    }

    #[test]
    fn signs_in_to_a_samba_share_gvfs_mounted_through_its_address() {
        assert_eq!(
            unreachable("/run/user/1000/gvfs/smb-share:server=nas.test,share=manga/Series"),
            Some(signed_in_at(
                "smb://nas.test/manga",
                "nas.test",
                "nas.test/manga"
            ))
        );
    }

    #[test]
    fn keeps_the_user_domain_and_escapes_of_a_gvfs_samba_share() {
        assert_eq!(
            unreachable(
                "/run/user/1000/gvfs/smb-share:domain=corp.test,server=nas.test,share=my%20manga,user=kai"
            ),
            Some(signed_in_at(
                "smb://corp.test;kai@nas.test/my%20manga",
                "nas.test",
                "nas.test/my manga"
            ))
        );
    }

    #[test]
    fn signs_in_to_an_ssh_or_ftp_server_gvfs_mounted_by_its_host() {
        assert_eq!(
            unreachable(
                "/run/user/1000/gvfs/sftp:host=nas.test,port=2222,user=kai/home/kai/Comics"
            ),
            Some(signed_in_at(
                "sftp://kai@nas.test:2222/",
                "nas.test",
                "nas.test"
            ))
        );
        assert_eq!(
            unreachable("/run/user/1000/gvfs/ftp:host=files.example.test/Comics"),
            Some(signed_in_at(
                "ftp://files.example.test/",
                "files.example.test",
                "files.example.test"
            ))
        );
    }

    #[test]
    fn signs_in_to_a_web_folder_apple_volume_or_nfs_export_gvfs_mounted() {
        assert_eq!(
            unreachable("/run/user/1000/gvfs/dav:host=dav.example.test,prefix=%2Fmanga,ssl=true"),
            Some(signed_in_at(
                "davs://dav.example.test/manga",
                "dav.example.test",
                "dav.example.test/manga"
            ))
        );
        assert_eq!(
            unreachable("/run/user/1000/gvfs/afp-volume:host=mac.test,user=kai,volume=Comics"),
            Some(signed_in_at(
                "afp://kai@mac.test/Comics",
                "mac.test",
                "mac.test/Comics"
            ))
        );
        assert_eq!(
            unreachable("/run/user/1000/gvfs/nfs:host=nas.test,prefix=%2Fexport%2Fmanga"),
            Some(signed_in_at(
                "nfs://nas.test/export/manga",
                "nas.test",
                "nas.test/export/manga"
            ))
        );
    }

    #[test]
    fn finds_no_share_for_a_gvfs_mount_of_a_phone_or_camera() {
        assert_eq!(
            unreachable("/run/user/1000/gvfs/mtp:host=Pixel/Internal"),
            None
        );
    }

    #[test]
    fn finds_no_unreachable_share_once_gvfs_has_it_mounted() {
        let mut asked = Vec::new();

        let found = unreachable_linux_share(
            Path::new("/run/user/1000/gvfs/smb-share:server=nas,share=manga/Gone"),
            TABLES,
            |root| {
                asked.push(root.to_path_buf());
                true
            },
        );

        assert_eq!(
            (found, asked),
            (
                None,
                vec![
                    Path::new("/run/user/1000/gvfs/smb-share:server=nas,share=manga").to_path_buf()
                ]
            )
        );
    }

    #[test]
    fn has_no_sign_in_for_a_share_kde_mounted_through_kio_fuse() {
        assert_eq!(
            unreachable("/run/user/1000/kio-fuse-AbCdEf/smb/kai@nas/manga/Series"),
            Some(mounted_by_system("nas", "nas/manga"))
        );
    }

    #[test]
    fn has_no_sign_in_for_a_share_listed_in_fstab_that_is_not_mounted() {
        assert_eq!(
            unreachable("/mnt/manga/Series"),
            Some(mounted_by_system("nas", "nas/manga"))
        );
        assert_eq!(
            unreachable("/srv/shared comics/Series"),
            Some(mounted_by_system("nas", "nas/export/comics"))
        );
    }

    #[test]
    fn has_no_sign_in_for_a_mounted_share_that_stopped_answering() {
        assert_eq!(
            unreachable("/mnt/films/Series"),
            Some(mounted_by_system("nas", "nas/films"))
        );
    }

    #[test]
    fn finds_no_unreachable_share_when_a_mounted_share_answers() {
        let found = unreachable_linux_share(Path::new("/mnt/films/Gone"), TABLES, |root| {
            root == Path::new("/mnt/films")
        });

        assert_eq!(found, None);
    }

    #[test]
    fn has_no_sign_in_for_a_share_an_automounter_mounts() {
        assert_eq!(
            unreachable("/mnt/auto/Series"),
            Some(mounted_by_system("nas", "nas/auto"))
        );
    }

    #[test]
    fn names_a_share_an_automounter_mounts_by_its_mount_point_when_fstab_does_not_list_it() {
        let found = unreachable_linux_share(
            Path::new("/mnt/auto/Series"),
            MountTables {
                mountinfo: MOUNTINFO,
                fstab: "",
            },
            |_| false,
        );

        assert_eq!(found, Some(mounted_by_system("auto", "/mnt/auto")));
    }

    #[test]
    fn finds_no_share_for_a_folder_on_a_disk_or_drive() {
        assert_eq!(
            [
                unreachable("/home/reader/Comics"),
                unreachable("/media/reader/Archive/Comics"),
                unreachable("/mnt/mangaka/Comics"),
            ],
            [None, None, None]
        );
    }
}
