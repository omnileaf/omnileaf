use std::path::PathBuf;

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, Row, params_from_iter};

use crate::{
    Error,
    catalog::{
        RootId, RootLocator,
        book_batches::{BOOKS_PER_QUERY, book_placeholders},
        native_path,
        root::stored_locator,
        stored_id::stored_id,
    },
};

const ROOT_LOCATOR_KIND_COLUMN: usize = 1;
const FILE_LOCATION_COLUMN: usize = 6;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookFileToRemove {
    pub book: BookId,
    pub root_id: RootId,
    pub root: RootLocator,
    pub location: PathBuf,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
}

fn files_in(count: usize) -> String {
    let placeholders = book_placeholders(count);
    format!(
        "SELECT book_file.book_id, library_root.locator_kind, library_root.location,
            library_root.bookmark, library_root.tree_name, library_root.tree_place,
            book_file.location, book_file.root_id, book_file.size_bytes, book_file.modified_at_ms
        FROM book_file
        JOIN library_root ON library_root.id = book_file.root_id
        WHERE book_file.book_id IN ({placeholders})"
    )
}

#[tracing::instrument(skip_all, fields(books = books.len()))]
pub fn files_of_books(
    connection: &Connection,
    books: &[BookId],
) -> Result<Vec<BookFileToRemove>, Error> {
    let mut files = Vec::new();
    for batch in books.chunks(BOOKS_PER_QUERY) {
        let mut statement = connection.prepare(&files_in(batch.len()))?;
        let found = statement.query_map(
            params_from_iter(batch.iter().map(BookId::as_bytes)),
            stored_file,
        )?;
        for file in found {
            files.push(file?);
        }
    }
    Ok(files)
}

fn stored_file(row: &Row<'_>) -> rusqlite::Result<BookFileToRemove> {
    Ok(BookFileToRemove {
        book: stored_id(row, "book_id")?,
        root_id: RootId(row.get("root_id")?),
        root: stored_locator(row, ROOT_LOCATOR_KIND_COLUMN)?,
        location: native_path::stored_native_path(row, FILE_LOCATION_COLUMN)?,
        size_bytes: row.get("size_bytes")?,
        modified_at_ms: row.get("modified_at_ms")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_files_of_a_batch_of_books_and_their_roots_by_their_keys() {
        let scratch = ScratchLibrary::new("files-of-books-plan");

        let plan = scratch.query_plan(&files_in(BOOKS_PER_QUERY));

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
