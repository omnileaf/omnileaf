use std::path::PathBuf;

use omnileaf_sync_proto::{Fingerprint, SeriesId};
use rusqlite::Transaction;

use crate::{
    Error,
    catalog::{
        NewBook, NewSeries, RootId, book::add_book_unless_present, native_path,
        series::add_series_unless_present, stored_id::stored_id,
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

const SERIES_OF_BOOK: &str = "SELECT series.id
     FROM book JOIN series ON series.local_id = book.series_local_id
     WHERE book.id = ?1";

/// A book file found in a library root, with the series its place on disk puts it in.
#[derive(Clone, Debug)]
pub struct ScannedBook {
    pub series: NewSeries,
    pub fingerprint: Fingerprint,
    pub title: String,
    pub added_at_ms: i64,
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

/// Adds the series and the book unless the catalog has them, points the file's row at the book, and returns the series the book is filed in.
#[tracing::instrument(skip_all, fields(root = %scanned.file.root))]
pub fn record_scanned_book(
    transaction: &Transaction<'_>,
    scanned: &ScannedBook,
) -> Result<SeriesId, Error> {
    add_series_unless_present(transaction, &scanned.series)?;
    let book = NewBook {
        fingerprint: scanned.fingerprint,
        series: scanned.series.id(),
        title: scanned.title.clone(),
        added_at_ms: scanned.added_at_ms,
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
    Ok(transaction
        .prepare(SERIES_OF_BOOK)?
        .query_row([book.id().as_bytes()], |row| stored_id(row, 0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_series_of_a_book_by_their_keys() {
        let scratch = ScratchLibrary::new("series-of-book-plan");

        let plan = scratch.query_plan(SERIES_OF_BOOK);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
