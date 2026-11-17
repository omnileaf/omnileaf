use std::{
    error::Error,
    fmt, fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

const ARCHIVE_EXTENSION: &str = "json";

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct ArchivedNotes {
    version: String,
    entries: Vec<ArchivedEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
struct ArchivedEntry {
    #[serde(rename = "type")]
    kind: String,
    summary: String,
}

#[derive(Debug)]
pub(crate) enum BundleError {
    Unreadable {
        path: PathBuf,
        source: io::Error,
    },
    Malformed {
        path: PathBuf,
        source: serde_json::Error,
    },
    Version {
        path: PathBuf,
        source: semver::Error,
    },
}

impl fmt::Display for BundleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unreadable { path, .. } => write!(formatter, "read {}", path.display()),
            Self::Malformed { path, .. } => write!(
                formatter,
                "read {} as a released version's notes",
                path.display()
            ),
            Self::Version { path, .. } => write!(
                formatter,
                "read the version in {} as a released version",
                path.display()
            ),
        }
    }
}

impl Error for BundleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Unreadable { source, .. } => Some(source),
            Self::Malformed { source, .. } => Some(source),
            Self::Version { source, .. } => Some(source),
        }
    }
}

pub(crate) fn read_released(folder: &Path) -> Result<Vec<ArchivedNotes>, BundleError> {
    archive_paths(folder)?
        .iter()
        .map(|path| read_archive(path))
        .collect()
}

fn archive_paths(folder: &Path) -> Result<Vec<PathBuf>, BundleError> {
    let unreadable = |source| BundleError::Unreadable {
        path: folder.to_path_buf(),
        source,
    };
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(unreadable(error)),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let path = entry.map_err(unreadable)?.path();
        if path
            .extension()
            .is_some_and(|extension| extension == ARCHIVE_EXTENSION)
        {
            paths.push(path);
        }
    }
    paths.sort_unstable();
    Ok(paths)
}

fn read_archive(path: &Path) -> Result<ArchivedNotes, BundleError> {
    let text = fs::read_to_string(path).map_err(|source| BundleError::Unreadable {
        path: path.to_path_buf(),
        source,
    })?;
    let notes: ArchivedNotes =
        serde_json::from_str(&text).map_err(|source| BundleError::Malformed {
            path: path.to_path_buf(),
            source,
        })?;
    semver::Version::parse(&notes.version).map_err(|source| BundleError::Version {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(notes)
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::ScratchFolder;
    use serde_json::{Value, json};

    use super::*;

    const RELEASED: &str = "released";

    fn bundled(scratch: &ScratchFolder) -> Value {
        let released = read_released(&scratch.path().join(RELEASED)).unwrap();
        serde_json::to_value(released).unwrap()
    }

    fn write_released(scratch: &ScratchFolder, name: &str, contents: &[u8]) {
        scratch.write(&format!("{RELEASED}/{name}"), contents);
    }

    fn archive(scratch: &ScratchFolder, name: &str, version: &str) {
        let notes = json!({
            "version": version,
            "entries": [{"type": "feat", "area": "library", "summary": format!("New in {version}.")}],
            "contributors": [],
        });
        write_released(scratch, name, notes.to_string().as_bytes());
    }

    #[test]
    fn keeps_only_the_version_and_each_entrys_type_and_summary() {
        let scratch = ScratchFolder::new("credited-archive");
        let notes = json!({
            "version": "1.2.0",
            "entries": [
                {"type": "feat", "area": "reader", "summary": "Pages turn faster."},
                {"type": "fix", "area": "library", "summary": "Scans finish."}
            ],
            "contributors": ["octocat"]
        });
        write_released(&scratch, "1.2.0.json", notes.to_string().as_bytes());

        let bundled = bundled(&scratch);

        assert_eq!(
            bundled,
            json!([{
                "version": "1.2.0",
                "entries": [
                    {"type": "feat", "summary": "Pages turn faster."},
                    {"type": "fix", "summary": "Scans finish."}
                ]
            }])
        );
    }

    #[test]
    fn a_missing_released_folder_gives_an_empty_bundle() {
        let scratch = ScratchFolder::new("nothing-released");

        let bundled = bundled(&scratch);

        assert_eq!(bundled, json!([]));
    }

    #[test]
    fn bundles_the_archives_in_file_name_order() {
        let scratch = ScratchFolder::new("three-releases");
        archive(&scratch, "1.2.0.json", "1.2.0");
        archive(&scratch, "0.9.0.json", "0.9.0");
        archive(&scratch, "1.10.0.json", "1.10.0");

        let bundled = bundled(&scratch);

        let versions: Vec<_> = bundled
            .as_array()
            .unwrap()
            .iter()
            .map(|notes| notes["version"].as_str().unwrap())
            .collect();
        assert_eq!(versions, ["0.9.0", "1.10.0", "1.2.0"]);
    }

    #[test]
    fn leaves_out_files_that_are_not_archives() {
        let scratch = ScratchFolder::new("released-with-a-note");
        archive(&scratch, "1.2.0.json", "1.2.0");
        write_released(&scratch, "README.md", b"# Released notes\n");

        let bundled = bundled(&scratch);

        assert_eq!(bundled.as_array().unwrap().len(), 1);
    }

    #[test]
    fn names_the_archive_that_is_not_a_released_versions_notes() {
        let scratch = ScratchFolder::new("broken-archive");
        archive(&scratch, "1.2.0.json", "1.2.0");
        write_released(&scratch, "1.3.0.json", br#"{"version": "1.3.0"}"#);

        let refused = read_released(&scratch.path().join(RELEASED)).unwrap_err();

        assert!(matches!(
            &refused,
            BundleError::Malformed { path, .. } if path.ends_with("1.3.0.json")
        ));
    }

    #[test]
    fn names_the_archive_whose_version_is_not_a_release_number() {
        let scratch = ScratchFolder::new("unreleased-archive");
        archive(&scratch, "1.2.0.json", "1.2.0");
        archive(&scratch, "unreleased.json", "unreleased");

        let refused = read_released(&scratch.path().join(RELEASED)).unwrap_err();

        assert!(matches!(
            &refused,
            BundleError::Version { path, .. } if path.ends_with("unreleased.json")
        ));
    }
}
