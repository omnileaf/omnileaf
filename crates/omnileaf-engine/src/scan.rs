use std::{
    collections::BTreeSet,
    error::Error,
    io,
    path::{Path, PathBuf, StripPrefixError},
    sync::Arc,
};

use omnileaf_db::{
    Database,
    catalog::{BookFile, NewSeries, RootId, RootKind, ScannedBook, record_scanned_books},
};
use omnileaf_formats::{Book, Details, FormatError, Limits, Storage, open_book_in};
use omnileaf_sync_proto::{KeyError, SeriesId};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    LibraryError,
    clock::unix_ms,
    library_layout::{FoundBook, Layout, find_books, folder_name},
};

pub(crate) const BOOKS_PER_BATCH: usize = 32;

/// How far a scan has got: still finding the books in the folder, or reading the ones it found.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum ScanProgress {
    Finding,
    Reading { scanned: u32, total: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderScan {
    pub name: String,
    pub series: u32,
    pub books: u32,
    pub unreadable_books: u32,
    /// Books in an archive format this version recognises but can't open yet, such as CBR.
    pub unsupported_books: u32,
    pub unreadable_folders: u32,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum UnreadableBook {
    #[error("open the book")]
    Format(#[from] FormatError),
    #[error("read when the book last changed")]
    Metadata(#[from] io::Error),
    #[error("name the book's series")]
    SeriesName(#[from] KeyError),
    #[error("place the book inside the folder scanned")]
    OutsideFolder(#[from] StripPrefixError),
}

impl UnreadableBook {
    /// Whether the book is in an archive format this version recognises but can't open yet, rather than damaged.
    pub(crate) fn is_unsupported_archive(&self) -> bool {
        matches!(
            self,
            Self::Format(FormatError::ArchiveNotSupportedYet { .. })
        )
    }
}

/// Size and modification time, which tell a rescan whether a book's file changed without reading it again.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct FileStamp {
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
}

/// The root a scan records its books under, and when it found them.
#[derive(Clone)]
pub(crate) struct Target {
    pub(crate) root: RootId,
    pub(crate) kind: RootKind,
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) folder: PathBuf,
    pub(crate) added_at_ms: i64,
}

#[derive(Default)]
struct Tally {
    scanned: u32,
    books: u32,
    unreadable_books: u32,
    unsupported_books: u32,
    series: BTreeSet<SeriesId>,
}

/// Fails only when the folder itself can't be read.
pub(crate) async fn find_books_in(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
) -> Result<Layout, LibraryError> {
    walk(storage, folder.clone())
        .await?
        .map_err(|source| LibraryError::FolderUnreadable {
            path: folder,
            source,
        })
}

/// Hands back the walk's own failure to read the folder for the caller to decide what it means.
pub(crate) async fn walk(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
) -> Result<io::Result<Layout>, LibraryError> {
    Ok(spawn_blocking(move || find_books(&*storage, &folder)).await?)
}

/// Records the books found in batches of one transaction each, reporting progress after every batch.
pub(crate) async fn scan(
    database: &Database,
    target: Target,
    layout: Layout,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<FolderScan, LibraryError> {
    let total = saturating_u32(layout.books.len());
    let mut tally = Tally::default();
    on_progress(ScanProgress::Reading { scanned: 0, total });
    for batch in layout.books.chunks(BOOKS_PER_BATCH) {
        let batch = batch.to_vec();
        let reading = target.clone();
        let read = spawn_blocking(move || {
            batch
                .iter()
                .map(|book| read_book(book, &reading))
                .collect::<Vec<_>>()
        })
        .await?;
        let found = tally.count(read);
        let filed_in = database
            .write(move |transaction| record_scanned_books(transaction, &found))
            .await?;
        tally.series.extend(filed_in);
        on_progress(ScanProgress::Reading {
            scanned: tally.scanned,
            total,
        });
    }
    Ok(FolderScan {
        name: folder_name(&target.folder),
        series: saturating_u32(tally.series.len()),
        books: tally.books,
        unreadable_books: tally.unreadable_books,
        unsupported_books: tally.unsupported_books,
        unreadable_folders: saturating_u32(layout.unreadable_folders.len()),
    })
}

impl Tally {
    fn count(&mut self, read: Vec<Result<ScannedBook, UnreadableBook>>) -> Vec<ScannedBook> {
        let mut found = Vec::with_capacity(read.len());
        for book in read {
            self.scanned = self.scanned.saturating_add(1);
            match book {
                Ok(book) => {
                    self.books = self.books.saturating_add(1);
                    found.push(book);
                }
                Err(unread) if unread.is_unsupported_archive() => {
                    self.unsupported_books = self.unsupported_books.saturating_add(1);
                }
                Err(_) => self.unreadable_books = self.unreadable_books.saturating_add(1),
            }
        }
        found
    }
}

pub(crate) fn saturating_u32(items: usize) -> u32 {
    u32::try_from(items).unwrap_or(u32::MAX)
}

pub(crate) fn read_book(found: &FoundBook, target: &Target) -> Result<ScannedBook, UnreadableBook> {
    let read = read_found_book(found, target);
    if let Err(error) = &read {
        warn_unreadable(found, error);
    }
    read
}

pub(crate) fn warn_unreadable(found: &FoundBook, error: &UnreadableBook) {
    tracing::warn!(
        path = %found.path.display(),
        error = error as &dyn Error,
        "skip a book the scan can't read"
    );
}

fn read_found_book(found: &FoundBook, target: &Target) -> Result<ScannedBook, UnreadableBook> {
    let location = found.path.strip_prefix(&target.folder)?.to_path_buf();
    let mut book = open_book_in(Arc::clone(&target.storage), &found.path, &Limits::default())?;
    let fingerprint = book.fingerprint()?;
    let details = target.storage.details(&found.path)?;
    let stamp = FileStamp::of(details, || Ok(book))?;
    Ok(ScannedBook {
        series: NewSeries::local(&found.series, target.added_at_ms)?,
        fingerprint,
        title: found.title.clone(),
        added_at_ms: target.added_at_ms,
        file: BookFile {
            root: target.root,
            location,
            size_bytes: stamp.size_bytes,
            modified_at_ms: stamp.modified_at_ms,
        },
    })
}

impl FileStamp {
    pub(crate) fn read(storage: &Arc<dyn Storage>, path: &Path) -> Result<Self, UnreadableBook> {
        Self::of(storage.details(path)?, || {
            open_book_in(Arc::clone(storage), path, &Limits::default())
        })
    }

    /// Opens a folder of images to add up its pages, since a folder's own size says nothing about them.
    fn of(
        details: Details,
        open: impl FnOnce() -> Result<Book, FormatError>,
    ) -> Result<Self, UnreadableBook> {
        let (Details::Folder { modified } | Details::File { modified, .. }) = details;
        let modified = modified.ok_or_else(|| io::Error::from(io::ErrorKind::Unsupported))?;
        let size_bytes = match details {
            Details::Folder { .. } => open()?.pages().iter().map(|page| page.size).sum(),
            Details::File { size, .. } => size,
        };
        Ok(Self {
            size_bytes,
            modified_at_ms: i64::try_from(unix_ms(modified)).unwrap_or(i64::MAX),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime};

    use omnileaf_formats::LocalStorage;

    use super::*;

    #[test]
    fn refuses_a_book_found_outside_the_folder_it_scans() {
        let target = Target {
            root: "1".parse().unwrap(),
            kind: RootKind::Linked,
            storage: Arc::new(LocalStorage),
            folder: PathBuf::from("/media/Sample Library"),
            added_at_ms: 0,
        };
        let found = FoundBook {
            path: PathBuf::from("/media/Elsewhere/v01.cbz"),
            series: "Sample Series 01".to_owned(),
            title: "v01".to_owned(),
        };

        let read = read_found_book(&found, &target);

        assert!(matches!(read, Err(UnreadableBook::OutsideFolder(_))));
    }

    #[test]
    fn stamps_a_file_with_the_size_and_change_time_its_storage_gives() {
        let details = Details::File {
            size: 2048,
            modified: Some(SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)),
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own")).unwrap();

        assert_eq!(
            stamp,
            FileStamp {
                size_bytes: 2048,
                modified_at_ms: 1_700_000_000_000,
            }
        );
    }

    #[test]
    fn refuses_a_book_whose_storage_cannot_tell_when_it_last_changed() {
        let details = Details::File {
            size: 2048,
            modified: None,
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own"));

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }

    #[test]
    fn refuses_a_folder_book_with_no_change_time_without_opening_it() {
        let details = Details::Folder { modified: None };

        let stamp = FileStamp::of(details, || {
            unreachable!("the stamp is refused before the pages are added up")
        });

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }
}
