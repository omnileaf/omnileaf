use std::{collections::BTreeSet, error::Error, fs, io, path::PathBuf};

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, LibraryRoot, NewSeries, RootId, RootLocator, ScannedBook, record_scanned_book,
    },
};
use omnileaf_formats::{FormatError, fingerprint_book, open_book};
use omnileaf_sync_proto::{KeyError, SeriesId};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    LibraryError,
    clock::unix_ms,
    folder_survey::folder_name,
    library_layout::{FoundBook, file_stem, find_books},
};

const BOOKS_PER_BATCH: usize = 32;

/// How far a scan has got through the books it found.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned: u32,
    pub total: u32,
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
}

/// The root a scan records its books under, and when it found them.
#[derive(Clone)]
struct Target {
    root: RootId,
    folder: PathBuf,
    added_at_ms: i64,
}

#[derive(Default)]
struct Tally {
    scanned: u32,
    books: u32,
    unreadable_books: u32,
    series: BTreeSet<SeriesId>,
}

/// Records the root's books in batches of one transaction each, reporting progress after every batch.
pub(crate) async fn scan(
    database: &Database,
    root: LibraryRoot,
    added_at_ms: i64,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<FolderScan, LibraryError> {
    let RootLocator::Path(folder) = root.locator;
    let walked = folder.clone();
    let layout = spawn_blocking(move || find_books(&walked)).await??;
    let total = u32::try_from(layout.books.len()).unwrap_or(u32::MAX);
    let target = Target {
        root: root.id,
        folder,
        added_at_ms,
    };
    let mut tally = Tally::default();
    on_progress(ScanProgress { scanned: 0, total });
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
        database
            .write(move |transaction| {
                found
                    .iter()
                    .try_for_each(|book| record_scanned_book(transaction, book))
            })
            .await?;
        on_progress(ScanProgress {
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
                    self.series.insert(book.series.id());
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
            error = %describe(error),
            "skip a book the scan can't read"
        );
    }
    read
}

fn read_found_book(found: &FoundBook, target: &Target) -> Result<ScannedBook, UnreadableBook> {
    let book = open_book(&found.path)?;
    let title = file_stem(&found.path);
    let fingerprint = fingerprint_book(&found.path)?;
    let metadata = fs::metadata(&found.path)?;
    let size_bytes = if metadata.is_dir() {
        book.pages().iter().map(|page| page.size).sum()
    } else {
        metadata.len()
    };
    let location = found
        .path
        .strip_prefix(&target.folder)
        .unwrap_or(&found.path)
        .to_path_buf();
    Ok(ScannedBook {
        series: NewSeries::local(&found.series, target.added_at_ms)?,
        fingerprint,
        title,
        file: BookFile {
            root: target.root,
            location,
            size_bytes,
            modified_at_ms: i64::try_from(unix_ms(metadata.modified()?)).unwrap_or(i64::MAX),
        },
    })
}

fn describe(error: &dyn Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(source) = cause {
        description.push_str(": ");
        description.push_str(&source.to_string());
        cause = source.source();
    }
    description
}
