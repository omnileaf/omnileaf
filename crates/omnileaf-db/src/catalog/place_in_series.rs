use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension, named_params};

use crate::{
    Error,
    catalog::{
        BookReading, Cover, cover::stored_cover, series_books::stored_reading,
        staged_rows::snapshot, stored_id::stored_id,
    },
};

const BOOK_KEY: &str = "SELECT series_local_id, reading_order_key FROM book WHERE id = ?1";
const BOOKS_BEFORE: &str = "SELECT count(*) FROM book
    WHERE series_local_id = :series AND (reading_order_key, id) < (:key, :id)";

macro_rules! neighbour {
    ($beside:literal, $order:literal) => {
        concat!(
            "SELECT book.id, book.title,
                cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM book
            LEFT JOIN book_file AS cover
                ON cover.id = (SELECT min(id) FROM book_file WHERE book_file.book_id = book.id)
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = :series AND (book.reading_order_key, book.id) ",
            $beside,
            " (:key, :id) ORDER BY ",
            $order,
            " LIMIT 1"
        )
    };
}

const PREVIOUS_BOOK: &str = neighbour!("<", "book.reading_order_key DESC, book.id DESC");
const NEXT_BOOK: &str = neighbour!(">", "book.reading_order_key, book.id");

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
    /// The book's own cover, absent while it has no file.
    pub cover: Option<Cover>,
    pub reading: BookReading,
}

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
                cover: stored_cover(row)?,
                reading: stored_reading(row)?,
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

        let neighbour_plan = |beside: &str| {
            vec![
                format!(
                    "SEARCH book USING INDEX book_by_series (series_local_id=? AND (reading_order_key,id){beside}(?,?))"
                ),
                "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN".to_owned(),
                "CORRELATED SCALAR SUBQUERY 1".to_owned(),
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)".to_owned(),
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN".to_owned(),
            ]
        };
        assert_eq!(
            plans,
            [
                vec![
                    "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)<(?,?))".to_owned()
                ],
                neighbour_plan("<"),
                neighbour_plan(">"),
            ]
        );
    }
}
