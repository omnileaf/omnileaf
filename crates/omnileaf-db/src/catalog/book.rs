use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintKind, SeriesId};
use rusqlite::{Connection, OptionalExtension, Statement, Transaction};

use crate::{Error, book_order::book_order_key, catalog::stored_id::stored_id};

macro_rules! insert_book {
    ($on_conflict:literal) => {
        concat!(
            "INSERT INTO book (
                id, series_local_id, title, reading_order_key, added_at_ms, content_fp, fp_kind,
                page_count
            )
            SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7, ?8 FROM series WHERE id = ?2",
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
        reading_order_key = excluded.reading_order_key"
);
const SERIES_OF_BOOK: &str = "SELECT series.id AS series_id FROM book
    JOIN series ON series.local_id = book.series_local_id WHERE book.id = ?1";
const SERIES_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM series WHERE id = ?1)";
const RECORD_PAGE_COUNT: &str =
    "UPDATE book SET page_count = ?2 WHERE id = ?1 AND page_count IS NOT ?2";
const REMOVE_BOOK_WITHOUT_FILES: &str = "DELETE FROM book
    WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM book_file WHERE book_id = ?1)";

#[derive(Clone, Copy)]
pub(crate) enum Filing {
    WhereFirstFound,
    WhereFoundNow,
}

pub(crate) struct BookFiler<'t> {
    filing: Filing,
    add: Statement<'t>,
    series_exists: Statement<'t>,
    page_count: Statement<'t>,
}

#[derive(Clone, Debug)]
pub struct NewBook {
    pub fingerprint: Fingerprint,
    pub series: SeriesId,
    pub title: String,
    pub added_at_ms: i64,
    pub page_count: Option<u32>,
}

impl NewBook {
    #[must_use]
    pub fn id(&self) -> BookId {
        BookId::local(&self.fingerprint)
    }
}

#[tracing::instrument(skip_all, fields(book = %book.id(), series = %book.series))]
pub fn add_book(transaction: &Transaction<'_>, book: &NewBook) -> Result<(), Error> {
    if insert(&mut transaction.prepare(ADD_BOOK)?, book)? == 0 {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}

impl<'t> BookFiler<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>, filing: Filing) -> Result<Self, Error> {
        let add = match filing {
            Filing::WhereFirstFound => ADD_BOOK_UNLESS_PRESENT,
            Filing::WhereFoundNow => ADD_OR_REFILE_BOOK,
        };
        Ok(Self {
            filing,
            add: transaction.prepare(add)?,
            series_exists: transaction.prepare(SERIES_EXISTS)?,
            page_count: transaction.prepare(RECORD_PAGE_COUNT)?,
        })
    }

    pub(crate) fn file(&mut self, book: &NewBook) -> Result<(), Error> {
        let is_filed = insert(&mut self.add, book)? > 0
            || match self.filing {
                Filing::WhereFirstFound => self
                    .series_exists
                    .query_row([book.series.as_bytes()], |row| row.get(0))?,
                Filing::WhereFoundNow => false,
            };
        if !is_filed {
            return Err(Error::UnknownSeries { id: book.series });
        }
        Ok(())
    }

    pub(crate) fn record_page_count(&mut self, book: BookId, page_count: u32) -> Result<(), Error> {
        self.page_count.execute((book.as_bytes(), page_count))?;
        Ok(())
    }
}

#[tracing::instrument(skip_all, fields(%book, page_count))]
pub fn record_page_count(
    transaction: &Transaction<'_>,
    book: BookId,
    page_count: u32,
) -> Result<(), Error> {
    transaction
        .prepare(RECORD_PAGE_COUNT)?
        .execute((book.as_bytes(), page_count))?;
    Ok(())
}

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

pub(crate) fn series_of_book(
    connection: &Connection,
    book: BookId,
) -> Result<Option<SeriesId>, Error> {
    Ok(connection
        .prepare(SERIES_OF_BOOK)?
        .query_row([book.as_bytes()], |row| stored_id(row, "series_id"))
        .optional()?)
}

fn insert(statement: &mut Statement<'_>, book: &NewBook) -> Result<usize, Error> {
    Ok(statement.execute((
        book.id().as_bytes(),
        book.series.as_bytes(),
        &book.title,
        book_order_key(&book.title),
        book.added_at_ms,
        book.fingerprint.as_bytes(),
        kind_name(book.fingerprint.kind()),
        book.page_count,
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
            page_count: None,
        };

        let outcome = BookFiler::new(&transaction, Filing::WhereFirstFound)
            .and_then(|mut filer| filer.file(&book));

        assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == book.series));
    }

    #[test]
    fn records_a_book_s_page_count_through_its_key() {
        let scratch = ScratchLibrary::new("record-page-count-plan");

        let plan = scratch.query_plan(RECORD_PAGE_COUNT);

        assert_eq!(plan, ["SEARCH book USING PRIMARY KEY (id=?)"]);
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
                "SEARCH book_details USING PRIMARY KEY (book_id=?)",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)"
            ]
        );
    }
}
