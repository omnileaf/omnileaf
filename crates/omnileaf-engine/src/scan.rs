use std::{
    collections::BTreeSet,
    error::Error,
    fs, io,
    path::{PathBuf, StripPrefixError},
};

use omnileaf_db::{
    Database,
    catalog::{BookFile, NewSeries, RootId, ScannedBook, record_scanned_book},
};
use omnileaf_formats::{FormatError, fingerprint_book, open_book};
use omnileaf_sync_proto::{KeyError, SeriesId};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    LibraryError,
    clock::unix_ms,
    library_layout::{FoundBook, Layout, find_books, folder_name},
};

const BOOKS_PER_BATCH: usize = 32;

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
    pub unreadable_folders: u32,
}

#[derive(Debug, thiserror::Error)]
enum UnreadableBook {
    #[error("open the book")]
    Format(#[from] FormatError),
    #[error("read when the book last changed")]
    Metadata(#[from] io::Error),
    #[error("name the book's series")]
    SeriesName(#[from] KeyError),
    #[error("place the book inside the folder scanned")]
    OutsideFolder(#[from] StripPrefixError),
}

/// The root a scan records its books under, and when it found them.
#[derive(Clone)]
pub(crate) struct Target {
    pub(crate) root: RootId,
    pub(crate) folder: PathBuf,
    pub(crate) added_at_ms: i64,
}

#[derive(Default)]
struct Tally {
    scanned: u32,
    books: u32,
    unreadable_books: u32,
    series: BTreeSet<SeriesId>,
}

/// Fails only when the folder itself can't be read.
pub(crate) async fn find_books_in(folder: PathBuf) -> Result<Layout, LibraryError> {
    let walked = folder.clone();
    spawn_blocking(move || find_books(&walked))
        .await?
        .map_err(|source| LibraryError::FolderUnreadable {
            path: folder,
            source,
        })
}

/// Records the books found in batches of one transaction each, reporting progress after every batch.
pub(crate) async fn scan(
    database: &Database,
    target: Target,
    layout: Layout,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<FolderScan, LibraryError> {
    let total = u32::try_from(layout.books.len()).unwrap_or(u32::MAX);
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
            .write(move |transaction| {
                found
                    .iter()
                    .map(|book| record_scanned_book(transaction, book))
                    .collect::<Result<Vec<_>, _>>()
            })
            .await?;
        tally.series.extend(filed_in);
        on_progress(ScanProgress::Reading {
            scanned: tally.scanned,
            total,
        });
    }
    Ok(FolderScan {
        name: folder_name(&target.folder),
        series: u32::try_from(tally.series.len()).unwrap_or(u32::MAX),
        books: tally.books,
        unreadable_books: tally.unreadable_books,
        unreadable_folders: layout.unreadable_folders,
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
                Err(_) => self.unreadable_books = self.unreadable_books.saturating_add(1),
            }
        }
        found
    }
}

fn read_book(found: &FoundBook, target: &Target) -> Result<ScannedBook, UnreadableBook> {
    let read = read_found_book(found, target);
    if let Err(error) = &read {
        tracing::warn!(
            path = %found.path.display(),
            error = error as &dyn Error,
            "skip a book the scan can't read"
        );
    }
    read
}

fn read_found_book(found: &FoundBook, target: &Target) -> Result<ScannedBook, UnreadableBook> {
    let location = found.path.strip_prefix(&target.folder)?.to_path_buf();
    let book = open_book(&found.path)?;
    let fingerprint = fingerprint_book(&found.path)?;
    let metadata = fs::metadata(&found.path)?;
    let size_bytes = if metadata.is_dir() {
        book.pages().iter().map(|page| page.size).sum()
    } else {
        metadata.len()
    };
    Ok(ScannedBook {
        series: NewSeries::local(&found.series, target.added_at_ms)?,
        fingerprint,
        title: found.title.clone(),
        added_at_ms: target.added_at_ms,
        file: BookFile {
            root: target.root,
            location,
            size_bytes,
            modified_at_ms: i64::try_from(unix_ms(metadata.modified()?)).unwrap_or(i64::MAX),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_book_found_outside_the_folder_it_scans() {
        let target = Target {
            root: "1".parse().unwrap(),
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
}
