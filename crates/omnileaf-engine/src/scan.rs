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
use tokio::{sync::watch, task::spawn_blocking};

use crate::{
    LibraryError,
    book_details::read_details,
    clock::unix_ms,
    file_type::{FileType, HiddenFileTypes},
    library_layout::{FoundBook, Layout, find_books, folder_name},
    placement::{Placement, place_book},
    skipped_types::{SkippedFile, SkippedType},
    unread_books::UnreadBooks,
};

pub(crate) const BOOKS_PER_BATCH: usize = 32;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum ScanProgress {
    Adding { name: String, location: String },
    Finding { found: u32 },
    Reading { scanned: u32, total: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderScan {
    pub name: String,
    pub series: u32,
    pub books: u32,
    pub unreadable_books: u32,
    pub unsupported_books: u32,
    pub unreadable_folders: u32,
    #[specta(optional)]
    pub skipped_types: Vec<SkippedType>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum UnreadableBook {
    #[error("open the book")]
    Format(#[from] FormatError),
    #[error("open the book, a file of a type the library hides")]
    HiddenType(#[source] FormatError),
    #[error("open the book, a {} file this build can't read", .skipped.file_type)]
    UnsupportedType {
        skipped: Box<SkippedFile>,
        #[source]
        source: FormatError,
    },
    #[error("read when the book last changed")]
    Metadata(#[from] io::Error),
    #[error("name the book's series")]
    SeriesName(#[from] KeyError),
    #[error("place the book inside the folder scanned")]
    OutsideFolder(#[from] StripPrefixError),
}

impl UnreadableBook {
    fn opening(location: &Path, hidden: &HiddenFileTypes, source: FormatError) -> Self {
        match FileType::of(location) {
            Some(file_type) if file_type.is_unsupported_given(&source) => {
                if hidden.hides(location) {
                    Self::HiddenType(source)
                } else {
                    Self::UnsupportedType {
                        skipped: Box::new(SkippedFile {
                            file_type,
                            location: location.to_path_buf(),
                        }),
                        source,
                    }
                }
            }
            Some(_) | None => Self::Format(source),
        }
    }

    pub(crate) fn is_hidden(&self) -> bool {
        matches!(self, Self::HiddenType(_))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct FileStamp {
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
}

#[derive(Clone)]
pub(crate) struct Target {
    pub(crate) root: RootId,
    pub(crate) kind: RootKind,
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) folder: PathBuf,
    pub(crate) hidden: HiddenFileTypes,
    pub(crate) added_at_ms: i64,
}

#[derive(Default)]
struct Tally {
    scanned: u32,
    books: u32,
    unread: UnreadBooks,
    series: BTreeSet<SeriesId>,
}

pub(crate) async fn find_books_in(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
    on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<Layout, LibraryError> {
    walk(storage, folder.clone(), on_progress)
        .await?
        .map_err(|source| LibraryError::FolderUnreadable {
            path: folder,
            source,
        })
}

pub(crate) async fn walk(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<io::Result<Layout>, LibraryError> {
    let (found, mut found_so_far) = watch::channel(0);
    let mut walking = spawn_blocking(move || {
        find_books(&*storage, &folder, |count| {
            found.send_replace(count);
        })
    });
    loop {
        tokio::select! {
            biased;
            Ok(()) = found_so_far.changed() => on_progress(ScanProgress::Finding {
                found: saturating_u32(*found_so_far.borrow_and_update()),
            }),
            walked = &mut walking => return Ok(walked?),
        }
    }
}

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
        unreadable_books: tally.unread.unreadable,
        unsupported_books: tally.unread.unsupported,
        unreadable_folders: saturating_u32(layout.unreadable_folders.len()),
        skipped_types: tally.unread.skipped.into(),
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
                Err(unread) => self.unread.count(&unread),
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
    if let Err(error) = &read
        && !error.is_hidden()
    {
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
    let Placement { series, title } = place_book(&location, &folder_name(&target.folder));
    let mut book = open_book_in(Arc::clone(&target.storage), &found.path, &Limits::default())
        .map_err(|source| UnreadableBook::opening(&location, &target.hidden, source))?;
    let fingerprint = book.fingerprint()?;
    let page_count = saturating_u32(book.pages().len());
    let details = read_details(&mut book, &found.path);
    let stamp = FileStamp::of(target.storage.details(&found.path)?, || Ok(book))?;
    Ok(ScannedBook {
        series: NewSeries::local(&series, target.added_at_ms)?,
        fingerprint,
        title,
        added_at_ms: target.added_at_ms,
        page_count,
        details,
        file: BookFile {
            root: target.root,
            location,
            size_bytes: stamp.size_bytes,
            modified_at_ms: stamp.modified_at_ms,
        },
        numbering: None,
    })
}

impl FileStamp {
    pub(crate) fn read(storage: &Arc<dyn Storage>, path: &Path) -> Result<Self, UnreadableBook> {
        Self::of(storage.details(path)?, || {
            open_book_in(Arc::clone(storage), path, &Limits::default())
        })
    }

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
            hidden: HiddenFileTypes::default(),
            added_at_ms: 0,
        };
        let found = FoundBook {
            path: PathBuf::from("/media/Elsewhere/v01.cbz"),
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
