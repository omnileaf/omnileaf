use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

const BY_TITLE: &str = "SELECT local_id, id, title, title_sort_key, book_count, added_at_ms
    FROM series
    WHERE book_count > 0 AND (title_sort_key, local_id) > (?1, ?2)
    ORDER BY title_sort_key, local_id
    LIMIT ?3";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeriesOrder {
    Title,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesSummary {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub added_at_ms: i64,
}

/// Lists only the series holding at least one book, which are the ones the library shows.
pub fn series_page(
    connection: &Connection,
    order: SeriesOrder,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let limit = request.size.rows_to_fetch();
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let rows = match (order, after) {
        (SeriesOrder::Title, None) => title_rows(connection, (&[], i64::MIN, limit)),
        (SeriesOrder::Title, Some(Position::Title { sort_key, local_id })) => {
            title_rows(connection, (sort_key, *local_id, limit))
        }
    }?;
    Ok(Page::of(rows, request.size))
}

fn title_rows(
    connection: &Connection,
    after_and_limit: (&[u8], i64, i64),
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    let mut statement = connection.prepare(BY_TITLE)?;
    let rows = statement.query_map(after_and_limit, |row| {
        Ok((
            summary(row)?,
            Position::Title {
                sort_key: row.get(3)?,
                local_id: row.get(0)?,
            },
        ))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn summary(row: &Row<'_>) -> rusqlite::Result<SeriesSummary> {
    Ok(SeriesSummary {
        id: stored_id(row, 1)?,
        title: row.get(2)?,
        book_count: row.get(4)?,
        added_at_ms: row.get(5)?,
    })
}
