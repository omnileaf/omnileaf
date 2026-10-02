use std::path::PathBuf;

use omnileaf_sync_proto::Fingerprint;
use rusqlite::Transaction;

use crate::{
    Error,
    catalog::{
        NewBook, NewSeries, RootId, book::add_book_unless_present, native_path,
        series::add_series_unless_present,
    },
};

const RECORD_FILE: &str =
    "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (root_id, location) DO UPDATE SET
         book_id = excluded.book_id,
         size_bytes = excluded.size_bytes,
         modified_at_ms = excluded.modified_at_ms,
         rev = rev + 1
     WHERE book_id != excluded.book_id
         OR size_bytes != excluded.size_bytes
         OR modified_at_ms != excluded.modified_at_ms";

/// A book file found in a library root, with the series its place on disk puts it in.
#[derive(Clone, Debug)]
pub struct ScannedBook {
    pub series: NewSeries,
    pub fingerprint: Fingerprint,
    pub title: String,
    pub file: BookFile,
}

#[derive(Clone, Debug)]
pub struct BookFile {
    pub root: RootId,
    /// Relative to the root.
    pub location: PathBuf,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
}

/// Adds the series and the book unless the catalog has them, and points the file's row at the book.
#[tracing::instrument(skip_all, fields(root = %scanned.file.root))]
pub fn record_scanned_book(
    transaction: &Transaction<'_>,
    scanned: &ScannedBook,
) -> Result<(), Error> {
    add_series_unless_present(transaction, &scanned.series)?;
    let book = NewBook {
        fingerprint: scanned.fingerprint,
        series: scanned.series.id(),
        title: scanned.title.clone(),
        added_at_ms: scanned.series.added_at_ms(),
    };
    add_book_unless_present(transaction, &book)?;
    let file = &scanned.file;
    transaction.prepare(RECORD_FILE)?.execute((
        book.id().as_bytes(),
        file.root.0,
        native_path::to_bytes(&file.location),
        i64::try_from(file.size_bytes).unwrap_or(i64::MAX),
        file.modified_at_ms,
    ))?;
    Ok(())
}
