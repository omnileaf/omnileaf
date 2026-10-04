use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, Statement, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

macro_rules! books_in_series {
    ($($seek:literal)?) => {
        concat!(
            "SELECT book.id, book.title, book.title_sort_key, book.added_at_ms,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM book
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = :series) ",
            $($seek,)?
            " ORDER BY book.title_sort_key, book.id LIMIT :limit"
        )
    };
}

const FIRST_IN_SERIES: &str = books_in_series!();
const NEXT_IN_SERIES: &str =
    books_in_series!("AND (book.title_sort_key, book.id) > (:after_key, :after_id)");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookSummary {
    pub id: BookId,
    pub title: String,
    pub added_at_ms: i64,
    pub reading: BookReading,
}

/// How far a book has been read, as the synced registers last projected it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BookReading {
    NotStarted,
    /// Opened, or given a furthest page, and not marked read; the position is absent when only the furthest page is known.
    Started {
        position_page: Option<u32>,
    },
    Read,
}

#[tracing::instrument(skip_all, fields(%series, size = ?request.size))]
pub fn series_books(
    connection: &Connection,
    series: SeriesId,
    request: &PageRequest,
) -> Result<Page<BookSummary>, Error> {
    let series_id = series.as_bytes();
    let limit = request.size.rows_to_fetch();
    match request.after.as_ref().map(|cursor| &cursor.0) {
        None => read(
            series,
            connection.prepare(FIRST_IN_SERIES)?,
            named_params! { ":series": series_id, ":limit": limit },
        ),
        Some(Position::Book {
            series: listed,
            sort_key,
            id,
        }) if *listed == series => read(
            series,
            connection.prepare(NEXT_IN_SERIES)?,
            named_params! {
                ":series": series_id,
                ":after_key": sort_key,
                ":after_id": id.as_bytes(),
                ":limit": limit,
            },
        ),
        Some(
            Position::Book { .. }
            | Position::Title { .. }
            | Position::Added { .. }
            | Position::Root { .. },
        ) => Err(Error::CursorForAnotherList),
    }
    .map(|rows| Page::of(rows, request.size))
}

fn read(
    series: SeriesId,
    mut statement: Statement<'_>,
    params: &[(&str, &dyn ToSql)],
) -> Result<Vec<(BookSummary, Position)>, Error> {
    let rows = statement.query_map(params, |row| {
        let id = stored_id(row, "id")?;
        let book = BookSummary {
            id,
            title: row.get("title")?,
            added_at_ms: row.get("added_at_ms")?,
            reading: stored_reading(row)?,
        };
        let position = Position::Book {
            series,
            sort_key: row.get("title_sort_key")?,
            id,
        };
        Ok((book, position))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Reads `is_read`, `is_started` and `position_page`, which a book with no reading state leaves null.
pub(crate) fn stored_reading(row: &Row<'_>) -> rusqlite::Result<BookReading> {
    let is_read: Option<bool> = row.get("is_read")?;
    let is_started: Option<bool> = row.get("is_started")?;
    Ok(match (is_read, is_started) {
        (Some(true), _) => BookReading::Read,
        (_, Some(true)) => BookReading::Started {
            position_page: row.get("position_page")?,
        },
        _ => BookReading::NotStarted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn starts_a_series_books_and_their_reading_state_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("first-series-books-plan");

        let plan = scratch.query_plan(FIRST_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }

    #[test]
    fn walks_a_series_books_and_their_reading_state_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("series-books-plan");

        let plan = scratch.query_plan(NEXT_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)>(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }
}
