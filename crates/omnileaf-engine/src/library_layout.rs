//! Where books sit in a library folder: a folder is a series, a file at the top is a one-shot, and a folder of images is a book.

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

#[derive(Clone, Copy, PartialEq, Eq)]
enum Place {
    Root,
    Top,
    Nested,
}

/// Fails only when `root` itself can't be read; a subfolder that can't be read is counted and skipped.
pub(crate) fn find_books(root: &Path) -> Result<Layout, SurveyError> {
    let mut layout = Layout::default();
    let mut pending = vec![(root.to_path_buf(), Place::Root)];
    while let Some((folder, place)) = pending.pop() {
        match fs::read_dir(&folder) {
            Ok(entries) => layout.take_in(&folder, place, entries, &mut pending),
            Err(source) if place == Place::Root => {
                return Err(SurveyError::Unreadable {
                    path: folder,
                    source,
                });
            }
            Err(_) => layout.count_unreadable_folder(),
        }
    }
    layout
        .books
        .sort_by(|left, right| left.path.cmp(&right.path));
    Ok(layout)
}

impl Layout {
    fn take_in(
        &mut self,
        folder: &Path,
        place: Place,
        entries: fs::ReadDir,
        pending: &mut Vec<(PathBuf, Place)>,
    ) {
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
                Ok(kind) if kind.is_dir() => pending.push((entry.path(), place.inner())),
                Ok(kind) if kind.is_file() && is_comic(&file_name) => {
                    let path = entry.path();
                    let series = match place {
                        Place::Root => file_stem(&path),
                        Place::Top | Place::Nested => folder_name(folder),
                    };
                    self.books.push(FoundBook { path, series });
                }
                Ok(kind) if kind.is_file() && is_page_image(&name) => holds_pages = true,
                _ => {}
            }
        }
        if holds_pages {
            let series = match place {
                Place::Root | Place::Top => folder_name(folder),
                Place::Nested => folder
                    .parent()
                    .map_or_else(|| folder_name(folder), folder_name),
            };
            self.books.push(FoundBook {
                path: folder.to_path_buf(),
                series,
            });
        }
    }

    fn count_unreadable_folder(&mut self) {
        self.unreadable_folders = self.unreadable_folders.saturating_add(1);
    }
}

impl Place {
    const fn inner(self) -> Self {
        match self {
            Self::Root => Self::Top,
            Self::Top | Self::Nested => Self::Nested,
        }
    }
}

pub(crate) fn file_stem(path: &Path) -> String {
    path.file_stem().map_or_else(
        || folder_name(path),
        |stem| stem.to_string_lossy().into_owned(),
    )
}
