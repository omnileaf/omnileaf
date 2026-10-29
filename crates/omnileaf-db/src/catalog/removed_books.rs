use std::collections::BTreeSet;

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, params_from_iter};

use crate::{
    Error,
    catalog::{
        book_batches::{BOOKS_PER_QUERY, book_placeholders},
        stored_id::stored_id,
    },
};

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
}
