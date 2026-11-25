use std::{
    ffi::OsStr,
    io,
    num::NonZeroU64,
    path::{Path, PathBuf},
};

use omnileaf_formats::{self as formats, Entry, Storage, is_ignored, is_page_image};

use crate::file_type::FileType;

#[derive(Clone, Debug)]
pub(crate) struct FoundBook {
    pub(crate) path: PathBuf,
    pub(crate) form: BookForm,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BookForm {
    File { listed_bytes: NonZeroU64 },
    FileOfUnlistedSize,
    FolderOfImages,
}

impl BookForm {
    pub(crate) fn of_file_listed_as(size: u64) -> Self {
        NonZeroU64::new(size).map_or(Self::FileOfUnlistedSize, |listed_bytes| Self::File {
            listed_bytes,
        })
    }
}

#[derive(Debug, Default)]
pub(crate) struct Layout {
    pub(crate) books: Vec<FoundBook>,
    pub(crate) unreadable_folders: Vec<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryKind {
    Folder,
    Comic { size: u64 },
    Page,
    Unreadable,
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Place {
    Root,
    Inside,
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
                layout.take_in(&folder, entries, &mut pending);
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

    fn take_in(&mut self, folder: &Path, entries: Vec<Entry>, pending: &mut Vec<(PathBuf, Place)>) {
        let mut holds_pages = false;
        let mut holds_comics = false;
        for entry in entries {
            if is_ignored(&entry.name.to_string_lossy()) {
                continue;
            }
            match EntryKind::of(&entry) {
                EntryKind::Folder => pending.push((folder.join(&entry.name), Place::Inside)),
                EntryKind::Comic { size } => {
                    holds_comics = true;
                    self.books.push(FoundBook {
                        path: folder.join(&entry.name),
                        form: BookForm::of_file_listed_as(size),
                    });
                }
                EntryKind::Page => holds_pages = true,
                EntryKind::Unreadable => self.note_unreadable(folder),
                EntryKind::Other => {}
            }
        }
        let is_book_of_images = holds_pages && !holds_comics;
        if is_book_of_images {
            self.books.push(FoundBook {
                path: folder.to_path_buf(),
                form: BookForm::FolderOfImages,
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
            formats::EntryKind::File { size } if is_comic(&entry.name) => Self::Comic { size },
            formats::EntryKind::File { .. } if is_page_image(&entry.name.to_string_lossy()) => {
                Self::Page
            }
            formats::EntryKind::File { .. } | formats::EntryKind::Other => Self::Other,
        }
    }
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

    fn file(name: &str, size: u64) -> Entry {
        Entry {
            name: name.into(),
            kind: formats::EntryKind::File { size },
        }
    }

    fn forms_found_in(entries: Vec<Entry>) -> Vec<BookForm> {
        let mut layout = Layout::default();

        layout.take_in(Path::new("Sample"), entries, &mut Vec::new());

        layout.books.into_iter().map(|book| book.form).collect()
    }

    #[test]
    fn finds_a_comic_listed_with_a_size_as_a_file_of_that_size() {
        let forms = forms_found_in(vec![file("v01.cbz", 2048)]);

        assert_eq!(
            forms,
            vec![BookForm::File {
                listed_bytes: NonZeroU64::new(2048).unwrap()
            }]
        );
    }

    #[test]
    fn finds_a_comic_listed_at_no_bytes_as_a_file_of_unlisted_size() {
        let forms = forms_found_in(vec![file("v01.cbz", 0)]);

        assert_eq!(forms, vec![BookForm::FileOfUnlistedSize]);
    }

    #[test]
    fn finds_a_folder_of_pages_as_a_folder_of_images() {
        let forms = forms_found_in(vec![file("001.png", 512), file("002.png", 512)]);

        assert_eq!(forms, vec![BookForm::FolderOfImages]);
    }
}
