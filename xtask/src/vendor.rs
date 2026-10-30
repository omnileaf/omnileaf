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
const NOTICE_NAME: &str = "NOTICE";
const OWN_FILES: &[&str] = &[MANIFEST_NAME, NOTICE_NAME];
const TARBALL_NAME: &str = "pinned.tar.gz";
const EXTRACTED_FOLDER: &str = "extracted";
const DOWNLOAD_TIMEOUT_SECONDS: &str = "300";
const CONNECT_TIMEOUT_SECONDS: &str = "30";
const DOWNLOAD_RETRIES: &str = "3";

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Comparison {
    Offline,
    WithUpstream,
}

pub(crate) fn check(root: &Path, comparison: Comparison) -> anyhow::Result<Vec<Problem>> {
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
    if comparison == Comparison::WithUpstream {
        let work = WorkFolder::create(
            env::temp_dir().join(format!("omnileaf-vendor-check-{}", std::process::id())),
        )?;
        let upstream = upstream_problems(&manifest, work.path(), download);
        work.remove()?;
        found.extend(upstream?);
    }
    Ok(found)
}

struct WorkFolder {
    path: PathBuf,
}

impl WorkFolder {
    fn create(path: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(&path).with_context(|| format!("create {}", path.display()))?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn remove(self) -> anyhow::Result<()> {
        fs::remove_dir_all(&self.path).with_context(|| format!("remove {}", self.path.display()))
    }
}

impl Drop for WorkFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn upstream_problems(
    manifest: &Manifest,
    work: &Path,
    fetch: impl FnOnce(&str, &Path) -> anyhow::Result<()>,
) -> anyhow::Result<Vec<Problem>> {
    let tarball = work.join(TARBALL_NAME);
    fetch(&manifest.tarball, &tarball)?;
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
        .args(["--retry", DOWNLOAD_RETRIES, "--retry-all-errors"])
        .args(["--connect-timeout", CONNECT_TIMEOUT_SECONDS])
        .args(["--max-time", DOWNLOAD_TIMEOUT_SECONDS, "--output"])
        .arg(to)
        .arg(url)
        .status()
        .context("run curl")?;
    anyhow::ensure!(status.success(), "downloading {url} failed");
    Ok(())
}

fn tarball_members(tarball: &Path) -> anyhow::Result<Vec<String>> {
    let output = Command::new("tar")
        .arg("-tzf")
        .arg(tarball)
        .output()
        .context("run tar")?;
    anyhow::ensure!(output.status.success(), "listing the tarball failed");
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_owned)
        .collect())
}

fn extract(tarball: &Path, manifest: &Manifest, into: &Path) -> anyhow::Result<()> {
    let members = tarball_members(tarball)?;
    let present: Vec<String> = manifest
        .files
        .iter()
        .map(|file| format!("{}/{}", manifest.root, file.path))
        .filter(|member| members.contains(member))
        .collect();
    if present.is_empty() {
        return Ok(());
    }
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(tarball)
        .arg("-C")
        .arg(into)
        .arg("--strip-components=1")
        .args(&present)
        .status()
        .context("run tar")?;
    anyhow::ensure!(status.success(), "extracting the listed files failed");
    Ok(())
}

fn is_our_own_file(base: &Path, path: &Path) -> bool {
    OWN_FILES.iter().any(|name| path == base.join(name))
}

fn read_files(base: &Path, folder: &Path) -> io::Result<BTreeMap<String, Vec<u8>>> {
    let mut files = BTreeMap::new();
    for entry in fs::read_dir(folder)? {
        let path: PathBuf = entry?.path();
        if path.is_dir() {
            files.extend(read_files(base, &path)?);
        } else if !is_our_own_file(base, &path) {
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
    fn removes_the_work_folder_when_a_check_panics() {
        let path = scratch_folder("work-folder");

        let outcome = std::panic::catch_unwind(|| {
            let work = WorkFolder::create(path.clone()).unwrap();
            assert!(work.path().is_dir());
            panic!("tar crashed");
        });

        assert!(outcome.is_err());
        assert!(!path.exists());
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

    fn scratch(name: &str) -> WorkFolder {
        WorkFolder::create(scratch_folder(name)).unwrap()
    }

    fn write_pinned_tree(root: &Path, content: &str) {
        let folder = root.join(VENDORED_FOLDER);
        fs::create_dir_all(folder.join("libarchive")).unwrap();
        fs::write(folder.join("libarchive/archive.h"), content).unwrap();
        let manifest = format!(
            "tarball {PINNED_TARBALL}\nsha256 {TARBALL_HASH}\nroot {PINNED_ROOT}\n\n{}  libarchive/archive.h\n",
            sha256_hex(b"abc")
        );
        fs::write(folder.join(MANIFEST_NAME), manifest).unwrap();
    }

    #[test]
    fn checks_the_vendored_tree_against_its_manifest_without_the_network() {
        let root = scratch("offline-check");
        write_pinned_tree(root.path(), "abd");

        let found = check(root.path(), Comparison::Offline).unwrap();

        assert_eq!(
            found,
            [Problem::Altered {
                source: Source::Vendored,
                path: "libarchive/archive.h".to_owned()
            }]
        );
    }

    fn tarball_with(work: &Path, files: &[(&str, &str)]) -> Vec<u8> {
        let source = work.join("source");
        for (path, content) in files {
            let path = source.join("sample-1.0").join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        let tarball = work.join("built.tar.gz");
        let status = Command::new("tar")
            .arg("-czf")
            .arg(&tarball)
            .arg("-C")
            .arg(&source)
            .arg("sample-1.0")
            .status()
            .unwrap();
        assert!(status.success());
        fs::read(tarball).unwrap()
    }

    fn manifest_for(tarball: &[u8], paths: &[&str]) -> Manifest {
        Manifest {
            tarball_sha256: sha256_hex(tarball),
            files: paths
                .iter()
                .map(|path| ListedFile {
                    path: (*path).to_owned(),
                    sha256: HASH_A.to_owned(),
                })
                .collect(),
            ..sample_manifest()
        }
    }

    #[test]
    fn reports_a_tarball_whose_hash_differs_from_the_manifest() {
        let work = scratch("altered-tarball");
        let manifest = sample_manifest();

        let found = upstream_problems(&manifest, work.path(), |_, to| {
            Ok(fs::write(to, "not the pinned tarball")?)
        })
        .unwrap();

        assert_eq!(
            found,
            [Problem::TarballAltered {
                actual: sha256_hex(b"not the pinned tarball")
            }]
        );
    }

    #[test]
    fn reports_a_listed_file_the_tarball_lacks_as_missing() {
        let work = scratch("missing-member");
        let tarball = tarball_with(work.path(), &[("src/reader.c", "abc")]);
        let manifest = manifest_for(&tarball, &["src/reader.c", "src/writer.c"]);

        let found = upstream_problems(&manifest, work.path(), |_, to| Ok(fs::write(to, &tarball)?))
            .unwrap();

        assert_eq!(
            found,
            [Problem::Missing {
                source: Source::Tarball,
                path: "src/writer.c".to_owned()
            }]
        );
    }

    #[test]
    fn extracts_the_listed_files_that_match_the_tarball() {
        let work = scratch("matching-member");
        let tarball = tarball_with(work.path(), &[("src/reader.c", "abc"), ("other.c", "")]);
        let manifest = manifest_for(&tarball, &["src/reader.c"]);

        let found = upstream_problems(&manifest, work.path(), |_, to| Ok(fs::write(to, &tarball)?))
            .unwrap();

        assert_eq!(found, []);
    }

    #[test]
    fn keeps_our_own_notice_out_of_the_manifest_comparison() {
        let root = scratch("own-notice");
        write_pinned_tree(root.path(), "abc");
        fs::write(
            root.path().join(VENDORED_FOLDER).join(NOTICE_NAME),
            "notices",
        )
        .unwrap();

        let found = check(root.path(), Comparison::Offline).unwrap();

        assert_eq!(found, []);
    }
}
