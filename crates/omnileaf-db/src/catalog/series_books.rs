use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Statement, ToSql, named_params};

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
            "SELECT id, title, title_sort_key, added_at_ms
            FROM book
            WHERE series_local_id = (SELECT local_id FROM series WHERE id = :series) ",
            $($seek,)?
            " ORDER BY title_sort_key, id LIMIT :limit"
        )
    };
}

const FIRST_IN_SERIES: &str = books_in_series!();
const NEXT_IN_SERIES: &str = books_in_series!("AND (title_sort_key, id) > (:after_key, :after_id)");

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
        Some(Position::Book { .. } | Position::Title { .. } | Position::Added { .. }) => {
            Err(Error::CursorForAnotherList)
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_series_and_starts_its_books_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("first-series-books-plan");

        let plan = scratch.query_plan(FIRST_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }

    #[test]
    fn finds_a_series_and_walks_its_books_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("series-books-plan");

        let plan = scratch.query_plan(NEXT_IN_SERIES);

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
