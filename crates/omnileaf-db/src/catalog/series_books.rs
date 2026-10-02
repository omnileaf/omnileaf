use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::Connection;

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

const IN_SERIES: &str = "SELECT id, title, title_sort_key, added_at_ms
    FROM book
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = ?1)
        AND (title_sort_key, id) > (?2, ?3)
    ORDER BY title_sort_key, id
    LIMIT ?4";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookSummary {
    pub id: BookId,
    pub title: String,
    pub added_at_ms: i64,
}

/// A series missing from the catalog has no books, so its page is empty.
#[tracing::instrument(skip_all, fields(%series, size = ?request.size))]
pub fn series_books(
    connection: &Connection,
    series: SeriesId,
    request: &PageRequest,
) -> Result<Page<BookSummary>, Error> {
    let (sort_key, id): (&[u8], &[u8]) = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => (&[], &[]),
        Some(Position::Book {
            series: listed,
            sort_key,
            id,
        }) if *listed == series => (sort_key, id.as_bytes()),
        Some(
            Position::Book { .. }
            | Position::Title { .. }
            | Position::Added { .. }
            | Position::Root { .. },
        ) => {
            return Err(Error::CursorForAnotherList);
        }
    };
    let mut statement = connection.prepare(IN_SERIES)?;
    let rows = statement
        .query_map(
            (
                series.as_bytes(),
                sort_key,
                id,
                request.size.rows_to_fetch(),
            ),
            |row| {
                let id = stored_id(row, 0)?;
                let book = BookSummary {
                    id,
                    title: row.get(1)?,
                    added_at_ms: row.get(3)?,
                };
                let position = Position::Book {
                    series,
                    sort_key: row.get(2)?,
                    id,
                };
                Ok((book, position))
            },
        )?
        .collect::<Result<_, _>>()?;
    Ok(Page::of(rows, request.size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_series_and_walks_its_books_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("series-books-plan");

        let plan = scratch.query_plan(IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)>(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }
}
