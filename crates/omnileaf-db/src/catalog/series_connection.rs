use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, OptionalExtension};

use crate::{
    Error,
    catalog::{RootId, series_page::SeriesSummary},
};

const SOME_FOLDER_IS_MISSING: &str =
    "SELECT EXISTS (SELECT 1 FROM library_root WHERE unavailable_since_ms IS NOT NULL)";

macro_rules! is_every_file_in_a_missing_folder {
    () => {
        "count(*) > 0 AND count(library_root.unavailable_since_ms) = count(*)"
    };
}

macro_rules! join_file_folder {
    () => {
        " JOIN library_root ON library_root.id = book_file.root_id"
    };
}

macro_rules! is_book_not_connected {
    ($book:literal) => {
        concat!(
            "SELECT ",
            is_every_file_in_a_missing_folder!(),
            " FROM book_file",
            join_file_folder!(),
            " WHERE book_file.book_id = ",
            $book
        )
    };
}

const IS_NOT_CONNECTED: &str = concat!(
    "SELECT ",
    is_every_file_in_a_missing_folder!(),
    " FROM series
    JOIN book ON book.series_local_id = series.local_id
    JOIN book_file ON book_file.book_id = book.id",
    join_file_folder!(),
    " WHERE series.id = ?1"
);

const IS_BOOK_NOT_CONNECTED: &str = is_book_not_connected!("?1");

const MISSING_ROOT_OF_SERIES: &str = concat!(
    "SELECT book_file.root_id FROM book
    JOIN book_file ON book_file.book_id = book.id
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = ?1)
        AND (",
    is_book_not_connected!("book.id"),
    ")
    GROUP BY book_file.root_id
    ORDER BY count(*) DESC, book_file.root_id
    LIMIT 1"
);

const MISSING_ROOT_OF_BOOK: &str = concat!(
    "SELECT CASE WHEN ",
    is_every_file_in_a_missing_folder!(),
    " THEN min(book_file.root_id) END FROM book_file",
    join_file_folder!(),
    " WHERE book_file.book_id = ?1"
);

const BOOKS_NOT_CONNECTED: &str = concat!(
    "SELECT count(*) FROM book
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = ?1)
        AND (",
    is_book_not_connected!("book.id"),
    ")"
);

fn is_some_folder_missing(connection: &Connection) -> Result<bool, Error> {
    Ok(connection
        .prepare_cached(SOME_FOLDER_IS_MISSING)?
        .query_row([], |row| row.get(0))?)
}

/// Marks the listed series whose every book file sits in a missing folder, which only a folder shown anyway lets into a listing.
pub(crate) fn note_connections<'a>(
    connection: &Connection,
    series: impl Iterator<Item = &'a mut SeriesSummary>,
) -> Result<(), Error> {
    if !is_some_folder_missing(connection)? {
        return Ok(());
    }
    let mut statement = connection.prepare_cached(IS_NOT_CONNECTED)?;
    for summary in series {
        let is_not_connected: bool =
            statement.query_row([summary.id.as_bytes()], |row| row.get(0))?;
        summary.is_connected = !is_not_connected;
    }
    Ok(())
}

pub(crate) fn note_book_connections<'a>(
    connection: &Connection,
    books: impl Iterator<Item = (BookId, &'a mut bool)>,
) -> Result<(), Error> {
    if !is_some_folder_missing(connection)? {
        return Ok(());
    }
    let mut statement = connection.prepare_cached(IS_BOOK_NOT_CONNECTED)?;
    for (book, is_connected) in books {
        let is_not_connected: bool = statement.query_row([book.as_bytes()], |row| row.get(0))?;
        *is_connected = !is_not_connected;
    }
    Ok(())
}

pub(crate) fn books_not_connected(connection: &Connection, series: SeriesId) -> Result<u32, Error> {
    if !is_some_folder_missing(connection)? {
        return Ok(0);
    }
    Ok(connection
        .prepare_cached(BOOKS_NOT_CONNECTED)?
        .query_row([series.as_bytes()], |row| row.get(0))?)
}

pub fn missing_root_of_series(
    connection: &Connection,
    series: SeriesId,
) -> Result<Option<RootId>, Error> {
    if !is_some_folder_missing(connection)? {
        return Ok(None);
    }
    Ok(connection
        .prepare_cached(MISSING_ROOT_OF_SERIES)?
        .query_row([series.as_bytes()], |row| row.get(0))
        .optional()?
        .map(RootId))
}

pub fn missing_root_of_book(
    connection: &Connection,
    book: BookId,
) -> Result<Option<RootId>, Error> {
    if !is_some_folder_missing(connection)? {
        return Ok(None);
    }
    let root: Option<i64> = connection
        .prepare_cached(MISSING_ROOT_OF_BOOK)?
        .query_row([book.as_bytes()], |row| row.get(0))?;
    Ok(root.map(RootId))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn looks_for_a_missing_folder_in_the_few_folders_there_are() {
        let scratch = ScratchLibrary::new("connection-missing-plan");

        let plan = scratch.query_plan(SOME_FOLDER_IS_MISSING);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SCAN library_root"
            ]
        );
    }

    #[test]
    fn walks_one_series_to_its_files_through_indexes() {
        let scratch = ScratchLibrary::new("connection-series-plan");

        let plan = scratch.query_plan(IS_NOT_CONNECTED);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn walks_one_book_to_its_files_through_indexes() {
        let scratch = ScratchLibrary::new("connection-book-plan");

        let plan = scratch.query_plan(IS_BOOK_NOT_CONNECTED);

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn counts_the_books_not_connected_of_one_series_through_indexes() {
        let scratch = ScratchLibrary::new("connection-series-books-plan");

        let plan = scratch.query_plan(BOOKS_NOT_CONNECTED);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn finds_the_missing_folder_of_one_series_through_indexes() {
        let scratch = ScratchLibrary::new("connection-series-root-plan");

        let plan = scratch.query_plan(MISSING_ROOT_OF_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "USE TEMP B-TREE FOR GROUP BY",
                "USE TEMP B-TREE FOR ORDER BY",
            ]
        );
    }

    #[test]
    fn finds_the_missing_folder_of_one_book_through_indexes() {
        let scratch = ScratchLibrary::new("connection-book-root-plan");

        let plan = scratch.query_plan(MISSING_ROOT_OF_BOOK);

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
