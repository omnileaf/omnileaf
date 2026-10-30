use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, Row, named_params};

use crate::{Error, catalog::stored_id::stored_id};

const BOOKS_UP_TO: &str = "SELECT count(*) FROM book
    WHERE series_local_id = :series
        AND (reading_order_key, id) > (:after_key, :after_id)
        AND (reading_order_key, id) <= (:through_key, :through_id)";

const NO_BOOK: &[u8] = &[];

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct ReadingOrder {
    series_local_id: i64,
    key: Vec<u8>,
    book: BookId,
}

impl ReadingOrder {
    pub(super) fn of(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            series_local_id: row.get("series_local_id")?,
            key: row.get("reading_order_key")?,
            book: stored_id(row, "book")?,
        })
    }
}

/// Each book's place in the reading order of its series counting from 1, in the order the books are given.
pub(super) fn places(connection: &Connection, books: &[&ReadingOrder]) -> Result<Vec<u32>, Error> {
    let mut in_reading_order: Vec<(usize, &ReadingOrder)> =
        books.iter().copied().enumerate().collect();
    in_reading_order.sort_by_key(|(_, order)| *order);
    let mut statement = connection.prepare_cached(BOOKS_UP_TO)?;
    let mut placed: Vec<(usize, u32)> = Vec::with_capacity(books.len());
    let mut before: Option<(&ReadingOrder, u32)> = None;
    for (index, book) in in_reading_order {
        let (after_key, after_id, held) = match before {
            Some((earlier, place)) if earlier.series_local_id == book.series_local_id => (
                earlier.key.as_slice(),
                earlier.book.as_bytes().as_slice(),
                place,
            ),
            _ => (NO_BOOK, NO_BOOK, 0),
        };
        let between: u32 = statement.query_row(
            named_params! {
                ":series": book.series_local_id,
                ":after_key": after_key,
                ":after_id": after_id,
                ":through_key": book.key,
                ":through_id": book.book.as_bytes().as_slice(),
            },
            |row| row.get(0),
        )?;
        let place = held + between;
        placed.push((index, place));
        before = Some((book, place));
    }
    placed.sort_unstable_by_key(|(index, _)| *index);
    Ok(placed.into_iter().map(|(_, place)| place).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_the_books_up_to_each_book_in_one_index_range() {
        let scratch = ScratchLibrary::new("chapter-positions-plan");

        let plan = scratch.query_plan(BOOKS_UP_TO);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)>(?,?) AND (reading_order_key,id)<(?,?))"
            ]
        );
    }
}
