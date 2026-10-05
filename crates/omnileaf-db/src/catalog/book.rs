use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintKind, SeriesId};
use rusqlite::Transaction;

use crate::{Error, title_sort::title_sort_key};

const ADD_BOOK: &str = "INSERT INTO book (
        id, series_local_id, title, title_sort_key, added_at_ms, content_fp, fp_kind
    )
    SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7 FROM series WHERE id = ?2";
const ADD_BOOK_UNLESS_PRESENT: &str = "INSERT INTO book (
        id, series_local_id, title, title_sort_key, added_at_ms, content_fp, fp_kind
    )
    SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7 FROM series WHERE id = ?2
    ON CONFLICT (id) DO NOTHING";
const SERIES_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM series WHERE id = ?1)";

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
        title_sort_key(&book.title),
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
}
