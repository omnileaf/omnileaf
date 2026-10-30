use std::{
    collections::BTreeMap,
    env,
    error::Error,
    fmt, fs, io,
    path::{Component, Path, PathBuf},
    process::Command,
};

use anyhow::Context;
use sha2::{Digest, Sha256};

const VENDORED_FOLDER: &str = "vendor/libarchive-3.8.10";
const MANIFEST_NAME: &str = "MANIFEST";
const TARBALL_NAME: &str = "pinned.tar.gz";
const EXTRACTED_FOLDER: &str = "extracted";
const SHA256_HEX_LENGTH: usize = 64;
const HASH_SEPARATOR: &str = "  ";
const DOWNLOAD_TIMEOUT_SECONDS: &str = "300";

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Source {
    Vendored,
    Tarball,
}

impl fmt::Display for Source {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Vendored => "the vendored copy",
            Self::Tarball => "the pinned tarball",
        })
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Problem {
    Missing { source: Source, path: String },
    Altered { source: Source, path: String },
    Unlisted { path: String },
    TarballAltered { actual: String },
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { source, path } => write!(f, "{path}: missing from {source}"),
            Self::Altered { source, path } => {
                write!(f, "{path}: differs from the MANIFEST hash in {source}")
            }
            Self::Unlisted { path } => write!(f, "{path}: vendored but not in the MANIFEST"),
            Self::TarballAltered { actual } => {
                write!(
                    f,
                    "the pinned tarball hashes to {actual}, not the MANIFEST's hash"
                )
            }
        }
    }
}

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

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .flat_map(|byte| [byte >> 4, byte & 0x0f])
        .filter_map(|nibble| char::from_digit(u32::from(nibble), 16))
        .collect()
}

pub(crate) fn problems(
    manifest: &Manifest,
    found: &BTreeMap<String, Vec<u8>>,
    source: Source,
) -> Vec<Problem> {
    let listed = manifest.files.iter().filter_map(|file| {
        let path = file.path.clone();
        match found.get(&file.path) {
            None => Some(Problem::Missing { source, path }),
            Some(bytes) if sha256_hex(bytes) != file.sha256 => {
                Some(Problem::Altered { source, path })
            }
            Some(_) => None,
        }
    });
    let unlisted = found
        .keys()
        .filter(|path| !manifest.files.iter().any(|file| &file.path == *path))
        .map(|path| Problem::Unlisted { path: path.clone() });
    listed.chain(unlisted).collect()
}

pub(crate) fn check(root: &Path) -> anyhow::Result<Vec<Problem>> {
    let folder = root.join(VENDORED_FOLDER);
    let manifest_path = folder.join(MANIFEST_NAME);
    let manifest = Manifest::parse(
        &fs::read_to_string(&manifest_path)
            .with_context(|| format!("read {}", manifest_path.display()))?,
    )
    .with_context(|| format!("read {}", manifest_path.display()))?;
    let vendored = read_files(&folder, &folder)
        .with_context(|| format!("read the files under {}", folder.display()))?;
    let mut found = problems(&manifest, &vendored, Source::Vendored);
    let work = env::temp_dir().join(format!("omnileaf-vendor-check-{}", std::process::id()));
    let upstream = in_work_folder(&work, |work| upstream_problems(&manifest, work));
    found.extend(upstream?);
    Ok(found)
}

fn in_work_folder<T>(
    work: &Path,
    run: impl FnOnce(&Path) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    let outcome = fs::create_dir_all(work)
        .with_context(|| format!("create {}", work.display()))
        .and_then(|()| run(work));
    let removed = fs::remove_dir_all(work).or_else(|error| match error.kind() {
        io::ErrorKind::NotFound => Ok(()),
        _ => Err(error),
    });
    let outcome = outcome?;
    removed.with_context(|| format!("remove {}", work.display()))?;
    Ok(outcome)
}

fn upstream_problems(manifest: &Manifest, work: &Path) -> anyhow::Result<Vec<Problem>> {
    let tarball = work.join(TARBALL_NAME);
    download(&manifest.tarball, &tarball)?;
    let actual = sha256_hex(&fs::read(&tarball).context("read the downloaded tarball")?);
    if actual != manifest.tarball_sha256 {
        return Ok(vec![Problem::TarballAltered { actual }]);
    }
    let extracted = work.join(EXTRACTED_FOLDER);
    fs::create_dir_all(&extracted).with_context(|| format!("create {}", extracted.display()))?;
    extract(&tarball, manifest, &extracted)?;
    let upstream = read_files(&extracted, &extracted).context("read the extracted files")?;
    Ok(problems(manifest, &upstream, Source::Tarball))
}

fn download(url: &str, to: &Path) -> anyhow::Result<()> {
    let status = Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--location"])
        .args(["--max-time", DOWNLOAD_TIMEOUT_SECONDS, "--output"])
        .arg(to)
        .arg(url)
        .status()
        .context("run curl")?;
    anyhow::ensure!(status.success(), "downloading {url} failed");
    Ok(())
}

fn extract(tarball: &Path, manifest: &Manifest, into: &Path) -> anyhow::Result<()> {
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(tarball)
        .arg("-C")
        .arg(into)
        .arg("--strip-components=1")
        .args(
            manifest
                .files
                .iter()
                .map(|file| format!("{}/{}", manifest.root, file.path)),
        )
        .status()
        .context("run tar")?;
    anyhow::ensure!(status.success(), "extracting the listed files failed");
    Ok(())
}

fn read_files(base: &Path, folder: &Path) -> io::Result<BTreeMap<String, Vec<u8>>> {
    let mut files = BTreeMap::new();
    for entry in fs::read_dir(folder)? {
        let path: PathBuf = entry?.path();
        if path.is_dir() {
            files.extend(read_files(base, &path)?);
        } else if path != base.join(MANIFEST_NAME) {
            let relative = path
                .strip_prefix(base)
                .map_err(io::Error::other)?
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            files.insert(relative, fs::read(&path)?);
        }
    }
    Ok(files)
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

    fn found(files: &[(&str, &str)]) -> BTreeMap<String, Vec<u8>> {
        files
            .iter()
            .map(|(path, content)| ((*path).to_owned(), content.as_bytes().to_vec()))
            .collect()
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

    #[test]
    fn finds_no_problem_when_every_file_matches() {
        let manifest = sample_manifest();

        let found = problems(
            &manifest,
            &found(&[("src/reader.c", "abc")]),
            Source::Vendored,
        );

        assert_eq!(found, []);
    }

    #[test]
    fn reports_a_listed_file_that_is_missing() {
        let manifest = sample_manifest();

        let found = problems(&manifest, &BTreeMap::new(), Source::Tarball);

        assert_eq!(
            found,
            [Problem::Missing {
                source: Source::Tarball,
                path: "src/reader.c".to_owned()
            }]
        );
    }

    #[test]
    fn reports_a_file_that_differs_from_its_listed_hash() {
        let manifest = sample_manifest();

        let found = problems(
            &manifest,
            &found(&[("src/reader.c", "abd")]),
            Source::Vendored,
        );

        assert_eq!(
            found,
            [Problem::Altered {
                source: Source::Vendored,
                path: "src/reader.c".to_owned()
            }]
        );
    }

    #[test]
    fn reports_a_file_the_manifest_does_not_list() {
        let manifest = sample_manifest();

        let found = problems(
            &manifest,
            &found(&[("src/reader.c", "abc"), ("src/extra.c", "")]),
            Source::Vendored,
        );

        assert_eq!(
            found,
            [Problem::Unlisted {
                path: "src/extra.c".to_owned()
            }]
        );
    }

    #[test]
    fn hashes_bytes_as_lowercase_sha256() {
        assert_eq!(sha256_hex(b"abc"), HASH_A);
    }

    fn scratch_folder(name: &str) -> PathBuf {
        env::temp_dir().join(format!("omnileaf-xtask-{name}-{}", std::process::id()))
    }

    #[test]
    fn reads_nested_files_by_relative_path_and_leaves_out_the_manifest() {
        let folder = scratch_folder("read-files");
        fs::create_dir_all(folder.join("src")).unwrap();
        fs::write(folder.join("src/reader.c"), "abc").unwrap();
        fs::write(folder.join(MANIFEST_NAME), "listing").unwrap();

        let files = read_files(&folder, &folder).unwrap();

        fs::remove_dir_all(&folder).unwrap();
        assert_eq!(files, found(&[("src/reader.c", "abc")]));
    }

    #[test]
    fn removes_the_work_folder_when_the_run_fails() {
        let folder = scratch_folder("work-folder");

        let result: anyhow::Result<()> = in_work_folder(&folder, |work| {
            assert!(work.is_dir());
            anyhow::bail!("download failed")
        });

        assert_eq!(result.unwrap_err().to_string(), "download failed");
        assert!(!folder.exists());
    }
}
