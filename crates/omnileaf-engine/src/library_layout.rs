//! Where books sit in a library folder: a folder is a series, and a folder of images is a book in its parent's series.

use std::{
    fs,
    path::{Path, PathBuf},
};

use omnileaf_formats::{is_ignored, is_page_image};

use crate::{
    SurveyError,
    folder_survey::{folder_name, is_comic},
};

#[derive(Clone, Debug)]
pub(crate) struct FoundBook {
    pub(crate) path: PathBuf,
    pub(crate) series: String,
}

#[derive(Debug, Default)]
pub(crate) struct Layout {
    /// In path order, so a scan always meets them in the same order.
    pub(crate) books: Vec<FoundBook>,
    pub(crate) unreadable_folders: u32,
}

/// Fails only when `root` itself can't be read; a subfolder that can't be read is counted and skipped.
pub(crate) fn find_books(root: &Path) -> Result<Layout, SurveyError> {
    let entries = fs::read_dir(root).map_err(|source| SurveyError::Unreadable {
        path: root.to_path_buf(),
        source,
    })?;
    let mut layout = Layout::default();
    let mut pending = Vec::new();
    layout.take_in(root, entries, &mut pending);
    while let Some(folder) = pending.pop() {
        match fs::read_dir(&folder) {
            Ok(entries) => layout.take_in(&folder, entries, &mut pending),
            Err(_) => layout.count_unreadable_folder(),
        }
    }
    layout
        .books
        .sort_by(|left, right| left.path.cmp(&right.path));
    Ok(layout)
}

impl Layout {
    fn take_in(&mut self, folder: &Path, entries: fs::ReadDir, pending: &mut Vec<PathBuf>) {
        let mut holds_pages = false;
        for entry in entries {
            let Ok(entry) = entry else {
                self.count_unreadable_folder();
                continue;
            };
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            if is_ignored(&name) {
                continue;
            }
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(entry.path()),
                Ok(kind) if kind.is_file() && is_comic(&file_name) => {
                    self.books.push(FoundBook {
                        path: entry.path(),
                        series: folder_name(folder),
                    });
                }
                Ok(kind) if kind.is_file() && is_page_image(&name) => holds_pages = true,
                _ => {}
            }
        }
        if holds_pages {
            self.books.push(FoundBook {
                path: folder.to_path_buf(),
                series: folder
                    .parent()
                    .map_or_else(|| folder_name(folder), folder_name),
            });
        }
    }

    fn count_unreadable_folder(&mut self) {
        self.unreadable_folders = self.unreadable_folders.saturating_add(1);
    }
}

pub(crate) fn file_stem(path: &Path) -> String {
    path.file_stem().map_or_else(
        || folder_name(path),
        |stem| stem.to_string_lossy().into_owned(),
    )
}
