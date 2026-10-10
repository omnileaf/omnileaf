use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension, named_params};

use crate::{
    Error,
    catalog::{staged_rows::snapshot, stored_id::stored_id},
};

const BOOK_KEY: &str = "SELECT series_local_id, title_sort_key FROM book WHERE id = ?1";
const BOOKS_BEFORE: &str = "SELECT count(*) FROM book
    WHERE series_local_id = :series AND (title_sort_key, id) < (:key, :id)";
const PREVIOUS_BOOK: &str = "SELECT id, title FROM book
    WHERE series_local_id = :series AND (title_sort_key, id) < (:key, :id)
    ORDER BY title_sort_key DESC, id DESC LIMIT 1";
const NEXT_BOOK: &str = "SELECT id, title FROM book
    WHERE series_local_id = :series AND (title_sort_key, id) > (:key, :id)
    ORDER BY title_sort_key, id LIMIT 1";

/// Where a book stands in its series' title order, and the books either side of it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlaceInSeries {
    /// Counting from 1.
    pub position: u32,
    pub previous: Option<SeriesNeighbour>,
    pub next: Option<SeriesNeighbour>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesNeighbour {
    pub id: BookId,
    pub title: String,
}

/// None for a book missing from the catalog.
#[tracing::instrument(skip_all, fields(%book))]
pub fn place_in_series(
    connection: &Connection,
    book: BookId,
) -> Result<Option<PlaceInSeries>, Error> {
    let _snapshot = snapshot(connection)?;
    let Some((series, key)) = connection
        .prepare(BOOK_KEY)?
        .query_row([book.as_bytes()], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
        })
        .optional()?
    else {
        return Ok(None);
    };
    let params = named_params! { ":series": series, ":key": key, ":id": book.as_bytes() };
    let before: u32 = connection
        .prepare(BOOKS_BEFORE)?
        .query_row(params, |row| row.get(0))?;
    Ok(Some(PlaceInSeries {
        position: before + 1,
        previous: neighbour(connection, PREVIOUS_BOOK, params)?,
        next: neighbour(connection, NEXT_BOOK, params)?,
    }))
}

fn neighbour(
    connection: &Connection,
    query: &str,
    params: &[(&str, &dyn rusqlite::ToSql)],
) -> Result<Option<SeriesNeighbour>, Error> {
    Ok(connection
        .prepare(query)?
        .query_row(params, |row| {
            Ok(SeriesNeighbour {
                id: stored_id(row, "id")?,
                title: row.get("title")?,
            })
        })
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_book_s_place_and_neighbours_through_the_series_index() {
        let scratch = ScratchLibrary::new("place-in-series-plan");

        let plans = [BOOKS_BEFORE, PREVIOUS_BOOK, NEXT_BOOK].map(|query| scratch.query_plan(query));

        assert_eq!(
            plans,
            [
                vec![
                    "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)<(?,?))"
                ],
                vec![
                    "SEARCH book USING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)<(?,?))"
                ],
                vec![
                    "SEARCH book USING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)>(?,?))"
                ],
            ]
        );
    }
}
