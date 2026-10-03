//! What a rescan must read, record and remove, worked out by comparing the folder with the catalog.

use std::{
    collections::{BTreeMap, btree_map::Entry},
    path::{Path, PathBuf},
};

use omnileaf_db::catalog::{ScannedBook, StoredFile};
use omnileaf_sync_proto::BookId;

use crate::{
    FileChanges,
    library_layout::{FoundBook, Layout},
    scan::{FileStamp, UnreadableBook, warn_unreadable},
};

/// A book found at a location the catalog has no file for, or whose file changed since.
#[derive(Clone)]
pub(crate) struct ToRead {
    pub(crate) found: FoundBook,
    /// The book the catalog last recorded at this location, absent for a new location.
    pub(crate) replacing: Option<BookId>,
}

pub(crate) struct Plan {
    pub(crate) to_read: Vec<ToRead>,
    pub(crate) changes: FileChanges,
    gone: Vec<PathBuf>,
    /// How many of each book's files went, so a book found at a new place can be told moved rather than added.
    gone_books: BTreeMap<BookId, u32>,
    /// Books whose file now holds another book, removed at the end unless found elsewhere.
    replaced: Vec<BookId>,
}

/// A book read for a rescan, beside the book its location held before.
pub(crate) struct ReadBook {
    pub(crate) book: Result<ScannedBook, UnreadableBook>,
    pub(crate) replacing: Option<BookId>,
}

/// The books read in one batch, split by how each is recorded.
#[derive(Default)]
pub(crate) struct Recording {
    pub(crate) unmoved: Vec<ScannedBook>,
    pub(crate) moved: Vec<ScannedBook>,
}

/// What the catalog loses once every changed book is recorded.
pub(crate) struct Forgetting {
    pub(crate) gone: Vec<PathBuf>,
    pub(crate) replaced: Vec<BookId>,
}

impl Plan {
    /// Compares each book found with the file the catalog holds at its location, by size and modification time alone.
    pub(crate) fn new(folder: &Path, layout: Layout, stored: Vec<StoredFile>) -> Self {
        let mut stored: BTreeMap<PathBuf, StoredFile> = stored
            .into_iter()
            .map(|file| (file.location.clone(), file))
            .collect();
        let mut plan = Self {
            to_read: Vec::new(),
            changes: FileChanges {
                unreadable_folders: count(layout.unreadable_folders.len()),
                ..FileChanges::default()
            },
            gone: Vec::new(),
            gone_books: BTreeMap::new(),
            replaced: Vec::new(),
        };
        for found in layout.books {
            plan.compare(folder, found, &mut stored);
        }
        let unread = relative_to(folder, &layout.unreadable_folders);
        for (location, file) in stored {
            if !unread
                .iter()
                .any(|unreadable| location.starts_with(unreadable))
            {
                plan.note_gone(location, file.book);
            }
        }
        plan
    }

    /// Sorts the books read in one batch into those found again, at a new place, or unreadable.
    pub(crate) fn sort(&mut self, read: Vec<ReadBook>) -> Recording {
        let mut recording = Recording::default();
        for ReadBook { book, replacing } in read {
            let Ok(book) = book else {
                self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
                continue;
            };
            let id = BookId::local(&book.fingerprint);
            match replacing {
                Some(previous) => {
                    self.changes.updated = self.changes.updated.saturating_add(1);
                    if previous != id {
                        self.replaced.push(previous);
                    }
                    recording.unmoved.push(book);
                }
                None if self.take_gone(id) => {
                    self.changes.moved = self.changes.moved.saturating_add(1);
                    recording.moved.push(book);
                }
                None => {
                    self.changes.added = self.changes.added.saturating_add(1);
                    recording.unmoved.push(book);
                }
            }
        }
        recording
    }

    /// Counts each file gone and not found again at a new place as removed.
    pub(crate) fn finish(self) -> (FileChanges, Forgetting) {
        let changes = FileChanges {
            removed: count(self.gone.len()).saturating_sub(self.changes.moved),
            ..self.changes
        };
        let forgetting = Forgetting {
            gone: self.gone,
            replaced: self.replaced,
        };
        (changes, forgetting)
    }

    fn compare(
        &mut self,
        folder: &Path,
        found: FoundBook,
        stored: &mut BTreeMap<PathBuf, StoredFile>,
    ) {
        let Ok(location) = found.path.strip_prefix(folder).map(Path::to_path_buf) else {
            self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
            return;
        };
        let known = stored.remove(&location);
        match FileStamp::read(&found.path) {
            Ok(stamp) if known.as_ref().map(FileStamp::from) == Some(stamp) => {}
            Ok(_) => self.to_read.push(ToRead {
                found,
                replacing: known.map(|file| file.book),
            }),
            Err(error) => {
                warn_unreadable(&found, &error);
                self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
            }
        }
    }

    fn note_gone(&mut self, location: PathBuf, book: BookId) {
        let files = self.gone_books.entry(book).or_insert(0);
        *files = files.saturating_add(1);
        self.gone.push(location);
    }

    fn take_gone(&mut self, book: BookId) -> bool {
        let Entry::Occupied(mut files) = self.gone_books.entry(book) else {
            return false;
        };
        let left = files.get().saturating_sub(1);
        if left == 0 {
            files.remove();
        } else {
            files.insert(left);
        }
        true
    }
}

impl Forgetting {
    pub(crate) fn is_empty(&self) -> bool {
        self.gone.is_empty() && self.replaced.is_empty()
    }
}

impl From<&StoredFile> for FileStamp {
    fn from(file: &StoredFile) -> Self {
        Self {
            size_bytes: file.size_bytes,
            modified_at_ms: file.modified_at_ms,
        }
    }
}

fn relative_to(folder: &Path, paths: &[PathBuf]) -> Vec<PathBuf> {
    paths
        .iter()
        .filter_map(|path| path.strip_prefix(folder).ok())
        .map(Path::to_path_buf)
        .collect()
}

fn count(items: usize) -> u32 {
    u32::try_from(items).unwrap_or(u32::MAX)
}
