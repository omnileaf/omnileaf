use std::{
    collections::BTreeMap,
    env, fmt, fs, io,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::Context;
use sha2::{Digest, Sha256};

use crate::vendor_manifest::Manifest;

pub(crate) const LIBARCHIVE_VERSION: &str = libarchive_version!();
const VENDOR_FOLDER: &str = "vendor";
const VENDORED_FOLDER_NAME: &str = concat!("libarchive-", libarchive_version!());
pub(crate) const VENDORED_FOLDER: &str = concat!("vendor/libarchive-", libarchive_version!());
const PINNED_ROOT: &str = VENDORED_FOLDER_NAME;
const PINNED_TARBALL: &str = concat!(
    "https://github.com/libarchive/libarchive/releases/download/v",
    libarchive_version!(),
    "/libarchive-",
    libarchive_version!(),
    ".tar.gz"
);
const MANIFEST_NAME: &str = "MANIFEST";
const TARBALL_NAME: &str = "pinned.tar.gz";
const EXTRACTED_FOLDER: &str = "extracted";
const DOWNLOAD_TIMEOUT_SECONDS: &str = "300";

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
    Missing {
        source: Source,
        path: String,
    },
    Altered {
        source: Source,
        path: String,
    },
    Unlisted {
        path: String,
    },
    TarballAltered {
        actual: String,
    },
    PinMismatch {
        field: &'static str,
        expected: &'static str,
    },
    OutsideVendoredFolder {
        path: String,
    },
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { source, path } => write!(f, "{path}: missing from {source}"),
            Self::Altered { source, path } => {
                write!(f, "{path}: differs from the MANIFEST hash in {source}")
            }
            Self::Unlisted { path } => write!(f, "{path}: vendored but not in the MANIFEST"),
            Self::PinMismatch { field, expected } => {
                write!(f, "the MANIFEST's {field} should be {expected}")
            }
            Self::OutsideVendoredFolder { path } => {
                write!(
                    f,
                    "{path}: outside {VENDORED_FOLDER}, which the MANIFEST covers"
                )
            }
            Self::TarballAltered { actual } => {
                write!(
                    f,
                    "the pinned tarball hashes to {actual}, not the MANIFEST's hash"
                )
            }
        }
    }
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

pub(crate) fn pin_problems(manifest: &Manifest) -> Vec<Problem> {
    [
        ("tarball", manifest.tarball.as_str(), PINNED_TARBALL),
        ("root", manifest.root.as_str(), PINNED_ROOT),
    ]
    .into_iter()
    .filter(|(_, found, expected)| found != expected)
    .map(|(field, _, expected)| Problem::PinMismatch { field, expected })
    .collect()
}

pub(crate) fn stray_entries(vendor_entries: &[String]) -> Vec<Problem> {
    vendor_entries
        .iter()
        .filter(|entry| entry.as_str() != VENDORED_FOLDER_NAME)
        .map(|entry| Problem::OutsideVendoredFolder {
            path: format!("{VENDOR_FOLDER}/{entry}"),
        })
        .collect()
}

fn vendor_entries(root: &Path) -> io::Result<Vec<String>> {
    fs::read_dir(root.join(VENDOR_FOLDER))?
        .map(|entry| Ok(entry?.file_name().to_string_lossy().into_owned()))
        .collect()
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
    let mut found = stray_entries(&vendor_entries(root).context("list the vendor folder")?);
    found.extend(pin_problems(&manifest));
    found.extend(problems(&manifest, &vendored, Source::Vendored));
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
    use crate::vendor_manifest::ListedFile;

    const HASH_A: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const TARBALL_HASH: &str = "a1bffbe5152cfe869751179e7b16648c87c461cb8c46eee75062efbe164cc57c";

    fn found(files: &[(&str, &str)]) -> BTreeMap<String, Vec<u8>> {
        files
            .iter()
            .map(|(path, content)| ((*path).to_owned(), content.as_bytes().to_vec()))
            .collect()
    }

    fn sample_manifest() -> Manifest {
        Manifest {
            tarball: "https://example.com/sample-1.0.tar.gz".to_owned(),
            tarball_sha256: TARBALL_HASH.to_owned(),
            root: "sample-1.0".to_owned(),
            files: vec![ListedFile {
                path: "src/reader.c".to_owned(),
                sha256: HASH_A.to_owned(),
            }],
        }
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

    fn pinned_manifest() -> Manifest {
        Manifest::parse(&format!(
            "tarball {PINNED_TARBALL}\nsha256 {TARBALL_HASH}\nroot {PINNED_ROOT}\n\n"
        ))
        .unwrap()
    }

    #[test]
    fn accepts_a_manifest_for_the_pinned_version() {
        assert_eq!(pin_problems(&pinned_manifest()), []);
    }

    #[test]
    fn reports_a_manifest_for_another_version() {
        let manifest = Manifest {
            tarball: PINNED_TARBALL.replace(LIBARCHIVE_VERSION, "3.8.9"),
            root: "libarchive-3.8.9".to_owned(),
            ..pinned_manifest()
        };

        assert_eq!(
            pin_problems(&manifest),
            [
                Problem::PinMismatch {
                    field: "tarball",
                    expected: PINNED_TARBALL
                },
                Problem::PinMismatch {
                    field: "root",
                    expected: PINNED_ROOT
                },
            ]
        );
    }

    #[test]
    fn reports_anything_in_vendor_beside_the_pinned_folder() {
        let entries = [VENDORED_FOLDER_NAME.to_owned(), "other-1.0".to_owned()];

        assert_eq!(
            stray_entries(&entries),
            [Problem::OutsideVendoredFolder {
                path: "vendor/other-1.0".to_owned()
            }]
        );
    }
}
