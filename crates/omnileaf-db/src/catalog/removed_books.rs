use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, params_from_iter};

use crate::{
    Error,
    catalog::{
        BookFileToRemove, RootId,
        book_batches::{BOOKS_PER_QUERY, book_placeholders},
        files_of_books, remove_book_files, remove_books_without_files,
        stored_id::stored_id,
    },
};

const MARKED_BOOKS_IN_CATALOG: &str = "SELECT book_removed.book_id FROM book_removed
    CROSS JOIN book ON book.id = book_removed.book_id";

fn removed_in(count: usize) -> String {
    let placeholders = book_placeholders(count);
    format!("SELECT book_id FROM book_removed WHERE book_id IN ({placeholders})")
}

#[tracing::instrument(skip_all, fields(books = books.len()))]
pub fn removed_among(connection: &Connection, books: &[BookId]) -> Result<BTreeSet<BookId>, Error> {
    let mut removed = BTreeSet::new();
    for batch in books.chunks(BOOKS_PER_QUERY) {
        let mut statement = connection.prepare(&removed_in(batch.len()))?;
        let found = statement.query_map(
            params_from_iter(batch.iter().map(BookId::as_bytes)),
            |row| stored_id::<BookId>(row, "book_id"),
        )?;
        for book in found {
            removed.insert(book?);
        }
    }
    Ok(removed)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemovedBook {
    pub book: BookId,
    pub files: Vec<BookFileToRemove>,
}

#[tracing::instrument(skip_all)]
pub fn remove_marked_books(connection: &Connection) -> Result<Vec<RemovedBook>, Error> {
    let marked = connection
        .prepare(MARKED_BOOKS_IN_CATALOG)?
        .query_map([], |row| stored_id::<BookId>(row, "book_id"))?
        .collect::<Result<Vec<_>, _>>()?;
    remove_catalog_rows(connection, &marked)
}

pub(crate) fn remove_catalog_rows(
    connection: &Connection,
    books: &[BookId],
) -> Result<Vec<RemovedBook>, Error> {
    let books: BTreeSet<BookId> = books.iter().copied().collect();
    let asked: Vec<BookId> = books.iter().copied().collect();
    let mut files_of: BTreeMap<BookId, Vec<BookFileToRemove>> = BTreeMap::new();
    let mut locations_in: BTreeMap<RootId, Vec<PathBuf>> = BTreeMap::new();
    for file in files_of_books(connection, &asked)? {
        locations_in
            .entry(file.root_id)
            .or_default()
            .push(file.location.clone());
        files_of.entry(file.book).or_default().push(file);
    }
    for (root, locations) in &locations_in {
        remove_book_files(connection, *root, locations)?;
    }
    let mut removed = Vec::new();
    for book in books {
        if remove_books_without_files(connection, &[book])? > 0 {
            removed.push(RemovedBook {
                book,
                files: files_of.remove(&book).unwrap_or_default(),
            });
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_removed_books_of_a_batch_through_the_primary_key() {
        let scratch = ScratchLibrary::new("removed-among-plan");

        let plan = scratch.query_plan(&removed_in(BOOKS_PER_QUERY));

        assert_eq!(plan, ["SEARCH book_removed USING PRIMARY KEY (book_id=?)"]);
    }

    #[test]
    fn finds_the_marked_books_still_in_the_catalog_through_the_book_key() {
        let scratch = ScratchLibrary::new("marked-books-in-catalog-plan");

        let plan = scratch.query_plan(MARKED_BOOKS_IN_CATALOG);

        assert_eq!(
            plan,
            ["SCAN book_removed", "SEARCH book USING PRIMARY KEY (id=?)"]
        );
    }
}
