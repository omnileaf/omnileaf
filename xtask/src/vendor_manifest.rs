use std::{
    error::Error,
    fmt,
    path::{Component, Path},
};

const SHA256_HEX_LENGTH: usize = 64;
const HASH_SEPARATOR: &str = "  ";

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ListedFile {
    pub(crate) path: String,
    pub(crate) sha256: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Manifest {
    pub(crate) tarball: String,
    pub(crate) tarball_sha256: String,
    pub(crate) root: String,
    pub(crate) files: Vec<ListedFile>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ManifestError {
    MissingField(&'static str),
    UnreadableLine { number: usize },
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingField(field) => write!(f, "the manifest has no `{field}` line"),
            Self::UnreadableLine { number } => write!(f, "manifest line {number} is not readable"),
        }
    }
}

impl Error for ManifestError {}

impl Manifest {
    pub(crate) fn parse(text: &str) -> Result<Self, ManifestError> {
        let mut tarball = None;
        let mut tarball_sha256 = None;
        let mut root = None;
        let mut files = Vec::new();
        for (index, line) in text
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.is_empty())
        {
            let unreadable = ManifestError::UnreadableLine { number: index + 1 };
            if let Some((sha256, path)) = line.split_once(HASH_SEPARATOR) {
                if !is_sha256(sha256) || !is_inside_folder(path) {
                    return Err(unreadable);
                }
                files.push(ListedFile {
                    path: path.to_owned(),
                    sha256: sha256.to_owned(),
                });
                continue;
            }
            match line.split_once(' ') {
                Some(("tarball", value)) => tarball = Some(value.to_owned()),
                Some(("sha256", value)) if is_sha256(value) => {
                    tarball_sha256 = Some(value.to_owned());
                }
                Some(("root", value)) if is_inside_folder(value) => root = Some(value.to_owned()),
                _ => return Err(unreadable),
            }
        }
        Ok(Self {
            tarball: tarball.ok_or(ManifestError::MissingField("tarball"))?,
            tarball_sha256: tarball_sha256.ok_or(ManifestError::MissingField("sha256"))?,
            root: root.ok_or(ManifestError::MissingField("root"))?,
            files,
        })
    }
}

fn is_sha256(text: &str) -> bool {
    text.len() == SHA256_HEX_LENGTH
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_inside_folder(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH_A: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const TARBALL_HASH: &str = "a1bffbe5152cfe869751179e7b16648c87c461cb8c46eee75062efbe164cc57c";

    fn manifest_text(files: &str) -> String {
        format!(
            "tarball https://example.com/sample-1.0.tar.gz\nsha256 {TARBALL_HASH}\nroot sample-1.0\n\n{files}"
        )
    }

    fn sample_manifest() -> Manifest {
        Manifest::parse(&manifest_text(&format!("{HASH_A}  src/reader.c\n"))).unwrap()
    }

    #[test]
    fn reads_the_tarball_its_root_and_the_listed_files() {
        let manifest = sample_manifest();

        assert_eq!(
            manifest,
            Manifest {
                tarball: "https://example.com/sample-1.0.tar.gz".to_owned(),
                tarball_sha256: TARBALL_HASH.to_owned(),
                root: "sample-1.0".to_owned(),
                files: vec![ListedFile {
                    path: "src/reader.c".to_owned(),
                    sha256: HASH_A.to_owned(),
                }],
            }
        );
    }

    #[test]
    fn rejects_a_manifest_without_a_tarball() {
        let text = format!("sha256 {TARBALL_HASH}\nroot sample-1.0\n\n");

        let result = Manifest::parse(&text);

        assert_eq!(result, Err(ManifestError::MissingField("tarball")));
    }

    #[test]
    fn rejects_a_file_line_with_a_short_hash() {
        let text = manifest_text("abc123  src/reader.c\n");

        let result = Manifest::parse(&text);

        assert_eq!(result, Err(ManifestError::UnreadableLine { number: 5 }));
    }

    #[test]
    fn rejects_a_path_that_leaves_the_folder() {
        let text = manifest_text(&format!("{HASH_A}  ../outside.c\n"));

        let result = Manifest::parse(&text);

        assert_eq!(result, Err(ManifestError::UnreadableLine { number: 5 }));
    }
}
