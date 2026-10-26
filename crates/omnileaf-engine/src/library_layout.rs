use std::{
    ffi::OsStr,
    io,
    path::{Path, PathBuf},
};

use omnileaf_formats::{self as formats, Entry, Storage, is_ignored, is_page_image};

use crate::file_type::FileType;

#[derive(Clone, Debug)]
pub(crate) struct FoundBook {
    pub(crate) path: PathBuf,
    pub(crate) series: String,
    pub(crate) title: String,
}

#[derive(Debug, Default)]
pub(crate) struct Layout {
    pub(crate) books: Vec<FoundBook>,
    pub(crate) unreadable_folders: Vec<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryKind {
    Folder,
    Comic,
    Page,
    Unreadable,
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Place {
    Root,
    Top,
    Nested,
}

pub(crate) fn find_books(
    storage: &dyn Storage,
    root: &Path,
    mut on_found: impl FnMut(usize),
) -> io::Result<Layout> {
    let mut layout = Layout::default();
    let mut pending = vec![(root.to_path_buf(), Place::Root)];
    while let Some((folder, place)) = pending.pop() {
        match storage.entries(&folder) {
            Ok(entries) => {
                let found_before = layout.books.len();
                layout.take_in(&folder, place, entries, &mut pending);
                if layout.books.len() > found_before {
                    on_found(layout.books.len());
                }
            }
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
    pub(crate) fn is_empty(&self) -> bool {
        self.books.is_empty() && self.unreadable_folders.is_empty()
    }

    fn take_in(
        &mut self,
        folder: &Path,
        place: Place,
        entries: Vec<Entry>,
        pending: &mut Vec<(PathBuf, Place)>,
    ) {
        let mut holds_pages = false;
        let mut holds_comics = false;
        for entry in entries {
            if is_ignored(&entry.name.to_string_lossy()) {
                continue;
            }
            match EntryKind::of(&entry) {
                EntryKind::Folder => pending.push((folder.join(&entry.name), place.inner())),
                EntryKind::Comic => {
                    holds_comics = true;
                    let path = folder.join(&entry.name);
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
                EntryKind::Unreadable => self.note_unreadable(folder),
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

    fn note_unreadable(&mut self, folder: &Path) {
        if self.unreadable_folders.last().map(PathBuf::as_path) != Some(folder) {
            self.unreadable_folders.push(folder.to_path_buf());
        }
    }
}

impl EntryKind {
    fn of(entry: &Entry) -> Self {
        match entry.kind {
            formats::EntryKind::Unreadable(_) => Self::Unreadable,
            formats::EntryKind::Folder => Self::Folder,
            formats::EntryKind::File { .. } if is_comic(&entry.name) => Self::Comic,
            formats::EntryKind::File { .. } if is_page_image(&entry.name.to_string_lossy()) => {
                Self::Page
            }
            formats::EntryKind::File { .. } | formats::EntryKind::Other => Self::Other,
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

pub(crate) fn is_comic(name: &OsStr) -> bool {
    FileType::of(Path::new(name)).is_some_and(|found| found.is_book())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_entry_whose_kind_cannot_be_read_as_unreadable_rather_than_not_a_book() {
        let failed = Entry {
            name: "v01.cbz".into(),
            kind: formats::EntryKind::Unreadable(io::ErrorKind::PermissionDenied),
        };

        let kind = EntryKind::of(&failed);

        assert_eq!(kind, EntryKind::Unreadable);
    }
}
