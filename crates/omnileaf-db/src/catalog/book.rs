use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintKind, SeriesId};
use rusqlite::Transaction;

use crate::{Error, book_order::book_order_key};

macro_rules! insert_book {
    ($on_conflict:literal) => {
        concat!(
            "INSERT INTO book (
                id, series_local_id, title, title_sort_key, added_at_ms, content_fp, fp_kind
            )
            SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7 FROM series WHERE id = ?2",
            $on_conflict
        )
    };
}

const ADD_BOOK: &str = insert_book!("");
const ADD_BOOK_UNLESS_PRESENT: &str = insert_book!(" ON CONFLICT (id) DO NOTHING");
const ADD_OR_REFILE_BOOK: &str = insert_book!(
    " ON CONFLICT (id) DO UPDATE SET
        series_local_id = excluded.series_local_id,
        title = excluded.title,
        title_sort_key = excluded.title_sort_key"
);
const SERIES_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM series WHERE id = ?1)";
const REMOVE_BOOK_WITHOUT_FILES: &str = "DELETE FROM book
    WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM book_file WHERE book_id = ?1)";

#[derive(Clone, Debug)]
pub struct NewBook {
    pub fingerprint: Fingerprint,
    pub series: SeriesId,
    pub title: String,
    pub added_at_ms: i64,
}

impl NewBook {
    #[must_use]
    pub fn id(&self) -> BookId {
        BookId::local(&self.fingerprint)
    }
}

/// Fails with [`Error::UnknownSeries`] when the book's series isn't in the catalog yet.
#[tracing::instrument(skip_all, fields(book = %book.id(), series = %book.series))]
pub fn add_book(transaction: &Transaction<'_>, book: &NewBook) -> Result<(), Error> {
    if insert(transaction, book, ADD_BOOK)? == 0 {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}

/// Leaves a book already in the catalog in the series it was first found in, and fails like [`add_book`] when its series is missing.
pub(crate) fn add_book_unless_present(
    transaction: &Transaction<'_>,
    book: &NewBook,
) -> Result<(), Error> {
    let is_added = insert(transaction, book, ADD_BOOK_UNLESS_PRESENT)? > 0;
    if !is_added && !series_exists(transaction, book.series)? {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}

/// Moves a book already in the catalog into `book`'s series under its title, keeping when it was added, and fails like [`add_book`] when that series is missing.
pub(crate) fn add_or_refile_book(
    transaction: &Transaction<'_>,
    book: &NewBook,
) -> Result<(), Error> {
    if insert(transaction, book, ADD_OR_REFILE_BOOK)? == 0 {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}

/// Deletes each of `books` that no root holds a file of any more, keeping its synced reading state for when it is found again.
#[tracing::instrument(skip_all, fields(books = books.len()))]
pub fn remove_books_without_files(
    transaction: &Transaction<'_>,
    books: &[BookId],
) -> Result<usize, Error> {
    let mut remove = transaction.prepare(REMOVE_BOOK_WITHOUT_FILES)?;
    let mut removed = 0;
    for book in books {
        removed = remove.execute([book.as_bytes()])?.saturating_add(removed);
    }
    Ok(removed)
}

fn series_exists(transaction: &Transaction<'_>, series: SeriesId) -> Result<bool, Error> {
    Ok(transaction
        .prepare(SERIES_EXISTS)?
        .query_row([series.as_bytes()], |row| row.get(0))?)
}

fn insert(transaction: &Transaction<'_>, book: &NewBook, sql: &str) -> Result<usize, Error> {
    Ok(transaction.prepare(sql)?.execute((
        book.id().as_bytes(),
        book.series.as_bytes(),
        &book.title,
        book_order_key(&book.title),
        book.added_at_ms,
        book.fingerprint.as_bytes(),
        kind_name(book.fingerprint.kind()),
    ))?)
}

const fn kind_name(kind: FingerprintKind) -> &'static str {
    match kind {
        FingerprintKind::Pmf1 => "pmf1",
        FingerprintKind::Dir1 => "dir1",
        FingerprintKind::Raw1 => "raw1",
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::ImageEntry;
    use rusqlite::Connection;

    use super::*;
    use crate::{Database, scratch::ScratchLibrary};

    #[test]
    fn refuses_a_book_whose_series_is_missing_from_the_catalog() {
        let scratch = ScratchLibrary::new("book-unknown-series");
        drop(Database::open(&scratch.config).unwrap());
        let mut connection = Connection::open(&scratch.config.path).unwrap();
        let transaction = connection.transaction().unwrap();
        let book = NewBook {
            fingerprint: Fingerprint::pmf1([ImageEntry { crc32: 1, size: 1 }]).unwrap(),
            series: SeriesId::local("Sample Series 01").unwrap(),
            title: "Volume 01".to_owned(),
            added_at_ms: 0,
        };

        let outcome = add_book_unless_present(&transaction, &book);

        assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == book.series));
    }

    #[test]
    fn checks_a_series_is_there_through_its_id_index() {
        let scratch = ScratchLibrary::new("series-exists-plan");

        let plan = scratch.query_plan(SERIES_EXISTS);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)"
            ]
        );
    }

    #[test]
    fn checks_a_book_for_files_through_their_book_index() {
        let scratch = ScratchLibrary::new("remove-fileless-book-plan");

        let plan = scratch.query_plan(REMOVE_BOOK_WITHOUT_FILES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)"
            ]
        );
    }
}
