use std::path::PathBuf;

use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{
        BookFileId, BookReading, native_path,
        root::{RootLocator, stored_locator},
        series_books::stored_reading,
        stored_id::stored_id,
    },
};

const BOOK_TO_READ: &str =
    "SELECT library_root.locator_kind, library_root.location, library_root.bookmark,
        library_root.tree_name, library_root.tree_place, book_file.location, book.title, series.id AS series_id, series.title AS series_title,
        book_file.id AS file_id, book_file.rev,
        book_state.is_read, book_state.is_started, book_state.position_page
    FROM book
    JOIN series ON series.local_id = book.series_local_id
    JOIN book_file ON book_file.id = (SELECT min(id) FROM book_file WHERE book_file.book_id = ?1)
    JOIN library_root ON library_root.id = book_file.root_id
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE book.id = ?1";
const ROOT_LOCATOR_KIND_COLUMN: usize = 0;
const FILE_LOCATION_COLUMN: usize = 5;

/// A book as the reader opens it: what it is called, where it is read from, and how far it has been read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookToRead {
    pub id: BookId,
    pub title: String,
    pub series: SeriesId,
    pub series_title: String,
    /// The book's first file, which its pages are read from.
    pub file: BookFileId,
    pub rev: u32,
    pub root: RootLocator,
    pub location: PathBuf,
    pub reading: BookReading,
}

/// None for a book missing from the catalog or left with no file to read.
#[tracing::instrument(skip_all, fields(%book))]
pub fn book_to_read(connection: &Connection, book: BookId) -> Result<Option<BookToRead>, Error> {
    Ok(connection
        .prepare(BOOK_TO_READ)?
        .query_row([book.as_bytes()], |row| stored_book(book, row))
        .optional()?)
}

fn stored_book(book: BookId, row: &Row<'_>) -> rusqlite::Result<BookToRead> {
    Ok(BookToRead {
        id: book,
        title: row.get("title")?,
        series: stored_id(row, "series_id")?,
        series_title: row.get("series_title")?,
        file: BookFileId(row.get("file_id")?),
        rev: row.get("rev")?,
        root: stored_locator(row, ROOT_LOCATOR_KIND_COLUMN)?,
        location: native_path::stored_native_path(row, FILE_LOCATION_COLUMN)?,
        reading: stored_reading(row)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_book_its_series_its_first_file_and_its_reading_by_their_keys() {
        let scratch = ScratchLibrary::new("book-to-read-plan");

        let plan = scratch.query_plan(BOOK_TO_READ);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book_file USING INTEGER PRIMARY KEY (rowid=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }
}
