use crate::{
    NetworkShare, ShareAddress, ShareSignIn, UnreachableShare,
    external_storage::{
        WINDOWS_DEVICE_PREFIX, WINDOWS_SHARE_PREFIX, WINDOWS_VERBATIM_PREFIX,
        WINDOWS_VERBATIM_SHARE_PREFIX, windows_drive_root,
    },
};

const PATH_SEPARATOR: char = '\\';

/// `remote_name_of` answers `WNetGetConnectionW` for a drive such as `Z:`, which names a mapped share even while it's disconnected.
#[must_use]
pub fn unreachable_windows_share(
    folder: &str,
    remote_name_of: impl FnOnce(&str) -> Option<String>,
    is_reachable: impl FnOnce(&str) -> bool,
) -> Option<UnreachableShare> {
    let remote = match within_share(folder) {
        Some(_) => folder.to_owned(),
        None => remote_name_of(windows_drive_root(folder)?.trim_end_matches(PATH_SEPARATOR))?,
    };
    let mut names = within_share(&remote)?
        .split(PATH_SEPARATOR)
        .filter(|name| !name.is_empty());
    let (server, share) = (names.next()?, names.next()?);
    let root = format!("{WINDOWS_SHARE_PREFIX}{server}{PATH_SEPARATOR}{share}");
    if is_reachable(&root) {
        return None;
    }
    Some(UnreachableShare {
        share: NetworkShare::on(server, share),
        sign_in: ShareSignIn::System(ShareAddress::new(root)),
    })
}

fn within_share(path: &str) -> Option<&str> {
    if let Some(inside) = path.strip_prefix(WINDOWS_VERBATIM_SHARE_PREFIX) {
        return Some(inside);
    }
    if path.starts_with(WINDOWS_VERBATIM_PREFIX) || path.starts_with(WINDOWS_DEVICE_PREFIX) {
        return None;
    }
    path.strip_prefix(WINDOWS_SHARE_PREFIX)
}

#[cfg(test)]
mod tests {
    use crate::{NetworkShare, ShareAddress, ShareSignIn};

    use super::*;

    fn signed_in_at(address: &str, server: &str, name: &str) -> UnreachableShare {
        UnreachableShare {
            share: NetworkShare {
                server: server.to_owned(),
                name: name.to_owned(),
            },
            sign_in: ShareSignIn::System(ShareAddress::new(address.to_owned())),
        }
    }

    fn unreachable(folder: &str) -> Option<UnreachableShare> {
        unreachable_windows_share(folder, |_| None, |_| false)
    }

    #[test]
    fn signs_in_to_the_share_a_folder_names() {
        assert_eq!(
            unreachable(r"\\nas\manga\Series"),
            Some(signed_in_at(r"\\nas\manga", "nas", "nas/manga"))
        );
        assert_eq!(
            unreachable(r"\\?\UNC\nas\manga\Series"),
            Some(signed_in_at(r"\\nas\manga", "nas", "nas/manga"))
        );
    }

    #[test]
    fn signs_in_to_the_share_a_drive_letter_is_mapped_to() {
        let mut asked = None;

        let found = unreachable_windows_share(
            r"\\?\Z:\Series",
            |drive| {
                asked = Some(drive.to_owned());
                Some(r"\\nas\manga".to_owned())
            },
            |_| false,
        );

        assert_eq!(
            (found, asked.as_deref()),
            (
                Some(signed_in_at(r"\\nas\manga", "nas", "nas/manga")),
                Some("Z:")
            )
        );
    }

    #[test]
    fn finds_no_unreachable_share_once_the_share_answers() {
        let mut asked = None;

        let found = unreachable_windows_share(
            r"\\nas\manga\Gone",
            |_| None,
            |root| {
                asked = Some(root.to_owned());
                true
            },
        );

        assert_eq!((found, asked.as_deref()), (None, Some(r"\\nas\manga")));
    }

    #[test]
    fn finds_no_share_for_a_folder_on_a_local_drive_or_a_device() {
        assert_eq!(
            [
                unreachable(r"C:\Comics"),
                unreachable(r"\\.\PhysicalDrive1\Comics"),
                unreachable(r"\\?\D:\Comics"),
                unreachable(r"\\nas"),
            ],
            [None, None, None, None]
        );
    }
}
