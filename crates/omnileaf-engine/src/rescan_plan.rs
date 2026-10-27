use std::{
    collections::{BTreeMap, btree_map::Entry},
    path::{Path, PathBuf},
};

use omnileaf_db::catalog::{ScannedBook, StoredFile};
use omnileaf_sync_proto::BookId;

use crate::{
    FileChanges,
    library_layout::{FoundBook, Layout},
    scan::{FileStamp, Target, UnreadableBook, saturating_u32, warn_unreadable},
};

pub(crate) struct ToRead {
    pub(crate) found: FoundBook,
    pub(crate) known: Known,
}

pub(crate) enum Known {
    NotYet,
    Changed(KnownFile),
    DetailsUnread(KnownFile),
}

pub(crate) struct KnownFile {
    book: BookId,
    location: PathBuf,
}

pub(crate) struct Plan {
    changes: FileChanges,
    gone: Vec<PathBuf>,
    gone_books: BTreeMap<BookId, u32>,
    replaced: Vec<Replacement>,
}

#[derive(Clone, Copy)]
pub(crate) struct Replacement {
    pub(crate) old: BookId,
    pub(crate) new: BookId,
}

pub(crate) struct ReadBook {
    pub(crate) book: Result<ScannedBook, UnreadableBook>,
    pub(crate) known: Known,
}

#[derive(Default)]
pub(crate) struct Recording {
    pub(crate) unmoved: Vec<ScannedBook>,
    pub(crate) moved: Vec<ScannedBook>,
}

pub(crate) struct Forgetting {
    pub(crate) gone: Vec<PathBuf>,
    pub(crate) replaced: Vec<Replacement>,
}

impl Plan {
    pub(crate) fn new(
        target: &Target,
        layout: Layout,
        stored: Vec<StoredFile>,
    ) -> (Self, Vec<ToRead>) {
        let mut stored: BTreeMap<PathBuf, StoredFile> = stored
            .into_iter()
            .map(|file| (file.location.clone(), file))
            .collect();
        let mut to_read = Vec::new();
        let mut plan = Self {
            changes: FileChanges {
                unreadable_folders: saturating_u32(layout.unreadable_folders.len()),
                ..FileChanges::default()
            },
            gone: Vec::new(),
            gone_books: BTreeMap::new(),
            replaced: Vec::new(),
        };
        for found in layout.books {
            to_read.extend(plan.compare(target, found, &mut stored));
        }
        let unread = relative_to(&target.folder, &layout.unreadable_folders);
        for (location, file) in stored {
            if !unread
                .iter()
                .any(|unreadable| location.starts_with(unreadable))
            {
                plan.note_gone(location, file.book);
            }
        }
        (plan, to_read)
    }

    pub(crate) fn sort(&mut self, read: Vec<ReadBook>) -> Recording {
        let mut recording = Recording::default();
        for ReadBook { book, known } in read {
            let book = match book {
                Ok(book) => book,
                Err(unread) if unread.is_hidden() => {
                    self.leave_out(known);
                    continue;
                }
                Err(unread) if unread.is_unsupported_archive() => {
                    self.changes.unsupported_books =
                        self.changes.unsupported_books.saturating_add(1);
                    continue;
                }
                Err(_) => {
                    self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
                    continue;
                }
            };
            let id = BookId::local(&book.fingerprint);
            match known {
                Known::DetailsUnread(kept) if kept.book == id => recording.unmoved.push(book),
                Known::Changed(previous) | Known::DetailsUnread(previous) => {
                    self.changes.updated = self.changes.updated.saturating_add(1);
                    if previous.book != id {
                        self.replaced.push(Replacement {
                            old: previous.book,
                            new: id,
                        });
                    }
                    recording.unmoved.push(book);
                }
                Known::NotYet if self.take_gone(id) => {
                    self.changes.moved = self.changes.moved.saturating_add(1);
                    recording.moved.push(book);
                }
                Known::NotYet => {
                    self.changes.added = self.changes.added.saturating_add(1);
                    recording.unmoved.push(book);
                }
            }
        }
        recording
    }

    pub(crate) fn finish(self) -> (FileChanges, Forgetting) {
        let forgetting = Forgetting {
            gone: self.gone,
            replaced: self.replaced,
        };
        (self.changes, forgetting)
    }

    fn compare(
        &mut self,
        target: &Target,
        found: FoundBook,
        stored: &mut BTreeMap<PathBuf, StoredFile>,
    ) -> Option<ToRead> {
        let Ok(location) = found
            .path
            .strip_prefix(&target.folder)
            .map(Path::to_path_buf)
        else {
            self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
            return None;
        };
        let known = stored.remove(&location);
        match FileStamp::read(&target.storage, &found.path) {
            Ok(stamp) => Known::of(known, location, stamp).map(|known| ToRead { found, known }),
            Err(error) => {
                warn_unreadable(&found, &error);
                self.changes.unreadable_books = self.changes.unreadable_books.saturating_add(1);
                None
            }
        }
    }

    fn leave_out(&mut self, hidden: Known) {
        if let Known::Changed(file) | Known::DetailsUnread(file) = hidden {
            self.note_gone(file.location, file.book);
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

impl Known {
    fn of(stored: Option<StoredFile>, location: PathBuf, stamp: FileStamp) -> Option<Self> {
        let Some(file) = stored else {
            return Some(Self::NotYet);
        };
        let known = KnownFile {
            book: file.book,
            location,
        };
        if FileStamp::from(&file) != stamp {
            return Some(Self::Changed(known));
        }
        (!file.has_details).then_some(Self::DetailsUnread(known))
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
