use std::{
    ffi::OsStr,
    fs, io,
    path::{Path, PathBuf},
};

use serde::Serialize;
use specta::Type;

const COMIC_EXTENSIONS: &[&str] = &["cbz", "cbr", "cb7"];
const MACOS_RESOURCE_FOLDER: &str = "__MACOSX";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderSurvey {
    pub name: String,
    pub comic_files: u32,
    pub unreadable_folders: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum SurveyError {
    #[error("read folder {path}")]
    Unreadable {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

/// Counts the comic archives under `root`, skipping subfolders it can't read rather than failing.
pub fn survey_folder(root: &Path) -> Result<FolderSurvey, SurveyError> {
    let entries = fs::read_dir(root).map_err(|source| SurveyError::Unreadable {
        path: root.to_path_buf(),
        source,
    })?;
    let mut survey = FolderSurvey {
        name: folder_name(root),
        comic_files: 0,
        unreadable_folders: 0,
    };
    let mut pending = Vec::new();
    survey.take_in(entries, &mut pending);
    while let Some(folder) = pending.pop() {
        match fs::read_dir(&folder) {
            Ok(entries) => survey.take_in(entries, &mut pending),
            Err(_) => survey.count_unreadable_folder(),
        }
    }
    Ok(survey)
}

impl FolderSurvey {
    fn take_in(&mut self, entries: fs::ReadDir, pending: &mut Vec<PathBuf>) {
        for entry in entries {
            let Ok(entry) = entry else {
                self.count_unreadable_folder();
                continue;
            };
            let name = entry.file_name();
            if is_ignored(&name) {
                continue;
            }
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(entry.path()),
                Ok(kind) if kind.is_file() && is_comic(&name) => {
                    self.comic_files = self.comic_files.saturating_add(1);
                }
                _ => {}
            }
        }
    }

    fn count_unreadable_folder(&mut self) {
        self.unreadable_folders = self.unreadable_folders.saturating_add(1);
    }
}

fn folder_name(root: &Path) -> String {
    root.file_name().map_or_else(
        || root.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

fn is_ignored(name: &OsStr) -> bool {
    name.as_encoded_bytes().starts_with(b".") || name == MACOS_RESOURCE_FOLDER
}

fn is_comic(name: &OsStr) -> bool {
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            COMIC_EXTENSIONS
                .iter()
                .any(|comic| extension.eq_ignore_ascii_case(comic))
        })
}
