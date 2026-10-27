use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintKind, SeriesId};
use rusqlite::{
    Connection, OptionalExtension, Statement, Transaction, params_from_iter, types::Value,
};

use crate::{
    Error,
    catalog::{BookFile, Numbering, native_path, stored_id::stored_id},
    reading_order::reading_order_key,
};

macro_rules! insert_book {
    ($on_conflict:expr) => {
        concat!(
            "INSERT INTO book (
                id, series_local_id, title, reading_order_key, added_at_ms, content_fp, fp_kind,
                page_count, kind, first_number, last_number, number_source, volume_number,
                volume_source
            )
            SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
            FROM series WHERE id = ?2",
            $on_conflict
        )
    };
}

macro_rules! in_its_only_file {
    () => {
        "(
            NOT EXISTS (
                SELECT 1 FROM book_file
                WHERE book_id = ?1 AND (root_id, location) IS NOT (:file_root, :file_location)
            )
            OR EXISTS (
                SELECT 1 FROM series AS kept
                WHERE kept.local_id = book.series_local_id AND kept.title_source IS NULL
            )
        )"
    };
}

macro_rules! add_or_relabel_book {
    ($refilable:expr) => {
        insert_book!(concat!(
            " ON CONFLICT (id) DO UPDATE SET
                title = excluded.title,
                reading_order_key = excluded.reading_order_key,
                kind = excluded.kind,
                first_number = excluded.first_number,
                last_number = excluded.last_number,
                number_source = excluded.number_source,
                volume_number = excluded.volume_number,
                volume_source = excluded.volume_source
            WHERE ",
            $refilable,
            " AND (
                title, reading_order_key, kind, first_number, last_number, number_source,
                volume_number, volume_source
            ) IS NOT (
                excluded.title, excluded.reading_order_key, excluded.kind, excluded.first_number,
                excluded.last_number, excluded.number_source, excluded.volume_number,
                excluded.volume_source
            )"
        ))
    };
}

macro_rules! move_book {
    ($refilable:expr) => {
        concat!(
            "UPDATE book SET series_local_id = series.local_id FROM series
            WHERE book.id = ?1 AND series.id = ?2 AND book.series_local_id IS NOT series.local_id
                AND ",
            $refilable
        )
    };
}

const ADD_BOOK: &str = insert_book!("");
const ADD_OR_RELABEL_BOOK: &str = add_or_relabel_book!("TRUE");
const ADD_OR_RELABEL_BOOK_IN_ITS_ONLY_FILE: &str = add_or_relabel_book!(in_its_only_file!());
const MOVE_BOOK: &str = move_book!("TRUE");
const MOVE_BOOK_IN_ITS_ONLY_FILE: &str = move_book!(in_its_only_file!());
const FILE_ROOT: &str = ":file_root";
const FILE_LOCATION: &str = ":file_location";
const SERIES_OF_BOOK: &str = "SELECT series.id AS series_id FROM book
    JOIN series ON series.local_id = book.series_local_id WHERE book.id = ?1";
const SERIES_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM series WHERE id = ?1)";
const RECORD_PAGE_COUNT: &str =
    "UPDATE book SET page_count = ?2 WHERE id = ?1 AND page_count IS NOT ?2";
const REMOVE_BOOK_WITHOUT_FILES: &str = "DELETE FROM book
    WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM book_file WHERE book_id = ?1)";

#[derive(Clone, Copy)]
pub(crate) enum Filing {
    FollowingItsOnlyFile,
    WhereFoundNow,
}

pub(crate) struct BookFiler<'t> {
    filing: Filing,
    add: Statement<'t>,
    move_to_series: Statement<'t>,
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
    pub numbering: Option<Numbering>,
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
        let (add, move_to_series) = match filing {
            Filing::FollowingItsOnlyFile => (
                ADD_OR_RELABEL_BOOK_IN_ITS_ONLY_FILE,
                MOVE_BOOK_IN_ITS_ONLY_FILE,
            ),
            Filing::WhereFoundNow => (ADD_OR_RELABEL_BOOK, MOVE_BOOK),
        };
        Ok(Self {
            filing,
            add: transaction.prepare(add)?,
            move_to_series: transaction.prepare(move_to_series)?,
            series_exists: transaction.prepare(SERIES_EXISTS)?,
            page_count: transaction.prepare(RECORD_PAGE_COUNT)?,
        })
    }

    pub(crate) fn file(&mut self, book: &NewBook, file: &BookFile) -> Result<(), Error> {
        let file = match self.filing {
            Filing::FollowingItsOnlyFile => Some(file),
            Filing::WhereFoundNow => None,
        };
        let is_added = run(&mut self.add, book_columns(book), file)? > 0;
        let book_key = [
            Value::from(book.id().as_bytes().to_vec()),
            Value::from(book.series.as_bytes().to_vec()),
        ];
        let is_moved = run(&mut self.move_to_series, book_key, file)? > 0;
        let is_filed = is_added
            || is_moved
            || self
                .series_exists
                .query_row([book.series.as_bytes()], |row| row.get(0))?;
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
    Ok(statement.execute(params_from_iter(book_columns(book)))?)
}

fn run(
    statement: &mut Statement<'_>,
    columns: impl IntoIterator<Item = Value>,
    file: Option<&BookFile>,
) -> Result<usize, Error> {
    for (index, column) in columns.into_iter().enumerate() {
        statement.raw_bind_parameter(index + 1, column)?;
    }
    if let Some(file) = file {
        statement.raw_bind_parameter(FILE_ROOT, file.root.0)?;
        statement.raw_bind_parameter(FILE_LOCATION, native_path::to_bytes(&file.location))?;
    }
    Ok(statement.raw_execute()?)
}

fn book_columns(book: &NewBook) -> [Value; 14] {
    let numbering = book.numbering.as_ref();
    let number = numbering.and_then(Numbering::number);
    let volume = numbering.and_then(Numbering::volume);
    [
        Value::from(book.id().as_bytes().to_vec()),
        Value::from(book.series.as_bytes().to_vec()),
        Value::from(book.title.clone()),
        Value::from(reading_order_key(numbering, &book.title)),
        Value::from(book.added_at_ms),
        Value::from(book.fingerprint.as_bytes().to_vec()),
        stored_text(Some(kind_name(book.fingerprint.kind()))),
        Value::from(book.page_count),
        stored_text(numbering.map(|numbering| numbering.kind().as_stored())),
        Value::from(number.map(|number| number.value.first().thousandths())),
        Value::from(number.map(|number| number.value.last().thousandths())),
        stored_text(number.map(|number| number.source.as_stored())),
        Value::from(volume.map(|volume| volume.value.thousandths())),
        stored_text(volume.map(|volume| volume.source.as_stored())),
    ]
}

fn stored_text(text: Option<&str>) -> Value {
    Value::from(text.map(str::to_owned))
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
    use crate::{Database, catalog::RootId, scratch::ScratchLibrary};

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
            numbering: None,
        };
        let file = BookFile {
            root: RootId(1),
            location: "Sample Series 01/Volume 01.cbz".into(),
            size_bytes: 1,
            modified_at_ms: 0,
        };

        let outcome = BookFiler::new(&transaction, Filing::FollowingItsOnlyFile)
            .and_then(|mut filer| filer.file(&book, &file));

        assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == book.series));
    }

    #[test]
    fn checks_a_book_for_other_files_through_their_book_index() {
        let scratch = ScratchLibrary::new("refile-in-only-file-plan");

        let plan = scratch.query_plan(ADD_OR_RELABEL_BOOK_IN_ITS_ONLY_FILE);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SCALAR SUBQUERY 2",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 3",
                "SEARCH kept USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book_details USING PRIMARY KEY (book_id=?)",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)"
            ]
        );
    }

    #[test]
    fn moves_a_book_in_its_only_file_through_its_key_and_its_series_key() {
        let scratch = ScratchLibrary::new("move-in-only-file-plan");

        let plan = scratch.query_plan(MOVE_BOOK_IN_ITS_ONLY_FILE);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH kept USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)"
            ]
        );
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
