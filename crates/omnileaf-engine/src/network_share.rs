use std::path::Path;

use serde::Serialize;
use specta::Type;

const SHARE_SEPARATOR: char = '/';
const SCHEME_END: &str = "://";
const USER_END: char = '@';
const HOST_END: char = ':';
const SOURCE_SEPARATORS: [char; 2] = ['/', '\\'];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NetworkShare {
    pub server: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnreachableShare {
    pub share: NetworkShare,
    pub sign_in: ShareSignIn,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShareSignIn {
    System(ShareAddress),
    MountedBySystem,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareAddress(String);

impl ShareAddress {
    pub(crate) fn new(address: String) -> Self {
        Self(address)
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl NetworkShare {
    pub(crate) fn on(server: &str, path: &str) -> Self {
        let folders: Vec<&str> = path
            .split(SOURCE_SEPARATORS)
            .filter(|folder| !folder.is_empty())
            .collect();
        let name = if folders.is_empty() {
            server.to_owned()
        } else {
            format!("{server}{SHARE_SEPARATOR}{}", folders.join("/"))
        };
        Self {
            server: server.to_owned(),
            name,
        }
    }

    pub(crate) fn from_mount_source(source: &str) -> Self {
        let after_scheme = source
            .split_once(SCHEME_END)
            .map_or(source, |(_, rest)| rest);
        let unslashed = after_scheme.trim_start_matches(SOURCE_SEPARATORS);
        let without_user = match unslashed.split_once(USER_END) {
            Some((user, rest)) if !user.contains(SOURCE_SEPARATORS) => rest,
            _ => unslashed,
        };
        match without_user.split_once(HOST_END) {
            Some((host, rest)) if !host.contains(SOURCE_SEPARATORS) => {
                Self::on(host, without_port(rest))
            }
            _ => {
                let (host, path) = without_user
                    .split_once(SOURCE_SEPARATORS)
                    .unwrap_or((without_user, ""));
                Self::on(host, path)
            }
        }
    }

    pub(crate) fn from_mount_point(point: &Path) -> Self {
        Self {
            server: point
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            name: point.display().to_string(),
        }
    }
}

fn without_port(rest: &str) -> &str {
    let (port, after) = rest.split_once(SHARE_SEPARATOR).unwrap_or((rest, ""));
    if !port.is_empty() && port.chars().all(|digit| digit.is_ascii_digit()) {
        after
    } else {
        rest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn named(source: &str) -> (String, String) {
        let share = NetworkShare::from_mount_source(source);
        (share.server, share.name)
    }

    fn pair(server: &str, name: &str) -> (String, String) {
        (server.to_owned(), name.to_owned())
    }

    #[test]
    fn names_a_samba_share_by_its_server_and_share() {
        assert_eq!(named("//nas/manga"), pair("nas", "nas/manga"));
        assert_eq!(named(r"\\nas\manga"), pair("nas", "nas/manga"));
    }

    #[test]
    fn names_an_nfs_or_ssh_export_by_its_host_and_path() {
        assert_eq!(named("nas:/export/manga"), pair("nas", "nas/export/manga"));
        assert_eq!(named("kai@nas:/books"), pair("nas", "nas/books"));
    }

    #[test]
    fn names_a_web_folder_by_its_host_and_path_without_scheme_or_port() {
        assert_eq!(
            named("https://dav.example.test:8443/manga/"),
            pair("dav.example.test", "dav.example.test/manga")
        );
    }

    #[test]
    fn names_a_share_mounted_by_an_automounter_by_its_mount_point() {
        let share = NetworkShare::from_mount_point(Path::new("/mnt/nas"));

        assert_eq!((share.server, share.name), pair("nas", "/mnt/nas"));
    }

    #[test]
    fn names_a_share_on_a_server_by_both() {
        let share = NetworkShare::on("nas", "manga");

        assert_eq!((share.server, share.name), pair("nas", "nas/manga"));
    }
}
