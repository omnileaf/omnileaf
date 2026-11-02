use std::{fmt::Write, path::Path};

const FILES_SCHEME: &str = "shareddocuments://";

/// Files opens a folder from a `shareddocuments` link holding its path, with each byte outside the unreserved set and the slash percent-encoded.
pub(crate) fn folder_url(file: &Path) -> Option<String> {
    let folder = file.parent()?.to_str()?;
    let mut url = String::from(FILES_SCHEME);
    for byte in folder.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/') {
            url.push(char::from(byte));
        } else {
            write!(url, "%{byte:02X}").ok()?;
        }
    }
    Some(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_to_the_folder_holding_the_file() {
        let url = folder_url(Path::new("/var/mobile/Documents/Manga/v01.cbz"));

        assert_eq!(
            url.as_deref(),
            Some("shareddocuments:///var/mobile/Documents/Manga")
        );
    }

    #[test]
    fn encodes_spaces_and_non_ascii_names() {
        let url = folder_url(Path::new("/Documents/My Manga/é/v01.cbz"));

        assert_eq!(
            url.as_deref(),
            Some("shareddocuments:///Documents/My%20Manga/%C3%A9")
        );
    }

    #[test]
    fn has_no_folder_for_a_bare_root() {
        assert_eq!(folder_url(Path::new("/")), None);
    }
}
