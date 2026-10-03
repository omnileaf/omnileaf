//! Where books sit in a library folder: a folder is a series, a file at the top is a one-shot, and a folder of images and no comics is a book.

use std::{
    ffi::OsStr,
    fs, io,
    path::{Path, PathBuf},
};

use omnileaf_formats::{is_ignored, is_page_image};

const COMIC_EXTENSIONS: &[&str] = &["cbz", "cbr", "cb7"];

#[derive(Clone, Debug)]
pub(crate) struct FoundBook {
    pub(crate) path: PathBuf,
    pub(crate) series: String,
    pub(crate) title: String,
}

#[derive(Debug, Default)]
pub(crate) struct Layout {
    /// In path order, so a scan always meets them in the same order.
    pub(crate) books: Vec<FoundBook>,
    /// Each folder the walk couldn't read in full, so nothing under it can be told gone.
    pub(crate) unreadable_folders: Vec<PathBuf>,
}

/// What one entry of a folder is to the walk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryKind {
    Folder,
    Comic,
    Page,
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Place {
    Root,
    Top,
    Nested,
}

/// Fails only when `root` itself can't be read; a subfolder that can't be read is counted and skipped.
pub(crate) fn find_books(root: &Path) -> io::Result<Layout> {
    let mut layout = Layout::default();
    let mut pending = vec![(root.to_path_buf(), Place::Root)];
    while let Some((folder, place)) = pending.pop() {
        match fs::read_dir(&folder) {
            Ok(entries) => layout.take_in(&folder, place, entries, &mut pending),
            Err(error) if place == Place::Root => return Err(error),
            Err(_) => layout.unreadable_folders.push(folder),
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
        let mut holds_comics = false;
        for entry in entries {
            let Ok(entry) = entry else {
                self.unreadable_folders.push(folder.to_path_buf());
                continue;
            };
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            if is_ignored(&name) {
                continue;
            }
            match EntryKind::of(&entry.file_type(), &file_name) {
                EntryKind::Folder => pending.push((entry.path(), place.inner())),
                EntryKind::Comic => {
                    holds_comics = true;
                    let path = entry.path();
                    let title = file_stem(&path);
                    let series = match place {
                        Place::Root => title.clone(),
                        Place::Top | Place::Nested => folder_name(folder),
                    };
                    self.books.push(FoundBook {
                        path,
                        series,
                        title,
                    });
                }
                EntryKind::Page => holds_pages = true,
                EntryKind::Other => {}
            }
        }
        let is_book_of_images = holds_pages && !holds_comics;
        if is_book_of_images {
            let series = match place {
                Place::Root | Place::Top => folder_name(folder),
                Place::Nested => folder
                    .parent()
                    .map_or_else(|| folder_name(folder), folder_name),
            };
            self.books.push(FoundBook {
                path: folder.to_path_buf(),
                series,
                title: folder_name(folder),
            });
        }
    }
}

impl EntryKind {
    fn of(file_type: &io::Result<fs::FileType>, file_name: &OsStr) -> Self {
        match file_type {
            Ok(kind) if kind.is_dir() => Self::Folder,
            Ok(kind) if kind.is_file() && is_comic(file_name) => Self::Comic,
            Ok(kind) if kind.is_file() && is_page_image(&file_name.to_string_lossy()) => Self::Page,
            _ => Self::Other,
        }
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

fn file_stem(path: &Path) -> String {
    path.file_stem().map_or_else(
        || folder_name(path),
        |stem| stem.to_string_lossy().into_owned(),
    )
}

pub(crate) fn folder_name(folder: &Path) -> String {
    folder.file_name().map_or_else(
        || folder.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
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
