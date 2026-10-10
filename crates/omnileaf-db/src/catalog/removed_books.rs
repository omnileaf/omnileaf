use std::collections::BTreeSet;

use rusqlite::{OptionalExtension, Row, Transaction};

use crate::{Error, catalog::RootId};

const REMOVE_ROOT_FILES: &str = "DELETE FROM book_file WHERE root_id = ?1
    RETURNING book_id, location, size_bytes, modified_at_ms, rev";
const REMOVE_BOOK_WITHOUT_FILES: &str = "DELETE FROM book
    WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM book_file WHERE book_id = ?1)
    RETURNING id, series_local_id, title, title_sort_key, added_at_ms, content_fp, fp_kind,
        logical_key";
const PUT_BACK_BOOK: &str = "INSERT INTO book (
        id, series_local_id, title, title_sort_key, added_at_ms, content_fp, fp_kind, logical_key
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT (id) DO NOTHING";
const PUT_BACK_FILE: &str =
    "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms, rev)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (root_id, location) DO NOTHING";

/// The rows removing a root's books took out of the catalog, kept to put them back as they were.
#[derive(Clone, Debug)]
pub struct RemovedBooks {
    root: RootId,
    files: Vec<RemovedFile>,
    books: Vec<RemovedBook>,
}

#[derive(Clone, Debug)]
struct RemovedFile {
    book_id: Vec<u8>,
    location: Vec<u8>,
    size_bytes: i64,
    modified_at_ms: i64,
    rev: i64,
}

#[derive(Clone, Debug)]
struct RemovedBook {
    id: Vec<u8>,
    series_local_id: i64,
    title: String,
    title_sort_key: Vec<u8>,
    added_at_ms: i64,
    content_fp: Option<Vec<u8>>,
    fp_kind: Option<String>,
    logical_key: Option<String>,
}

impl RemovedBooks {
    #[must_use]
    pub fn root(&self) -> RootId {
        self.root
    }

    /// Counts only the books no other root holds a file of, since the rest stay in the catalog.
    #[must_use]
    pub fn book_count(&self) -> usize {
        self.books.len()
    }
}

/// Deletes every file the root holds and each book left with no file anywhere.
#[tracing::instrument(skip_all, fields(%root))]
pub fn remove_root_books(
    transaction: &Transaction<'_>,
    root: RootId,
) -> Result<RemovedBooks, Error> {
    let files: Vec<RemovedFile> = transaction
        .prepare(REMOVE_ROOT_FILES)?
        .query_map([root.0], removed_file)?
        .collect::<Result<_, _>>()?;
    let held: BTreeSet<&[u8]> = files.iter().map(|file| file.book_id.as_slice()).collect();
    let mut remove = transaction.prepare(REMOVE_BOOK_WITHOUT_FILES)?;
    let mut books = Vec::new();
    for book in held {
        books.extend(remove.query_row([book], removed_book).optional()?);
    }
    Ok(RemovedBooks { root, files, books })
}

/// Puts back what [`remove_root_books`] took out, leaving alone any book or file found again since.
#[tracing::instrument(skip_all, fields(root = %removed.root))]
pub fn put_back_root_books(
    transaction: &Transaction<'_>,
    removed: &RemovedBooks,
) -> Result<(), Error> {
    let mut put_back_book = transaction.prepare(PUT_BACK_BOOK)?;
    for book in &removed.books {
        put_back_book.execute((
            &book.id,
            book.series_local_id,
            &book.title,
            &book.title_sort_key,
            book.added_at_ms,
            &book.content_fp,
            &book.fp_kind,
            &book.logical_key,
        ))?;
    }
    let mut put_back_file = transaction.prepare(PUT_BACK_FILE)?;
    for file in &removed.files {
        put_back_file.execute((
            &file.book_id,
            removed.root.0,
            &file.location,
            file.size_bytes,
            file.modified_at_ms,
            file.rev,
        ))?;
    }
    Ok(())
}

fn removed_file(row: &Row<'_>) -> rusqlite::Result<RemovedFile> {
    Ok(RemovedFile {
        book_id: row.get("book_id")?,
        location: row.get("location")?,
        size_bytes: row.get("size_bytes")?,
        modified_at_ms: row.get("modified_at_ms")?,
        rev: row.get("rev")?,
    })
}

fn removed_book(row: &Row<'_>) -> rusqlite::Result<RemovedBook> {
    Ok(RemovedBook {
        id: row.get("id")?,
        series_local_id: row.get("series_local_id")?,
        title: row.get("title")?,
        title_sort_key: row.get("title_sort_key")?,
        added_at_ms: row.get("added_at_ms")?,
        content_fp: row.get("content_fp")?,
        fp_kind: row.get("fp_kind")?,
        logical_key: row.get("logical_key")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_root_s_files_to_remove_through_its_location_index() {
        let scratch = ScratchLibrary::new("remove-root-books-plan");

        let plan = scratch.query_plan(REMOVE_ROOT_FILES);

        assert_eq!(
            plan,
            ["SEARCH book_file USING COVERING INDEX sqlite_autoindex_book_file_1 (root_id=?)"]
        );
    }
}
