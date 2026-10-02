use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Params, Row};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

/// A query reading one page in some order, and the sort values that place a row in that order.
struct Listing {
    sql: &'static str,
    position: fn(&Row<'_>) -> rusqlite::Result<Position>,
}

const BY_TITLE: Listing = Listing {
    sql: "SELECT local_id, id, title, title_sort_key, book_count, added_at_ms
        FROM series
        WHERE book_count > 0 AND (title_sort_key, local_id) > (?1, ?2)
        ORDER BY title_sort_key, local_id
        LIMIT ?3",
    position: |row| {
        Ok(Position::Title {
            sort_key: row.get(3)?,
            local_id: row.get(0)?,
        })
    },
};

const BY_RECENTLY_ADDED: Listing = Listing {
    sql: "SELECT local_id, id, title, title_sort_key, book_count, added_at_ms
        FROM series
        WHERE book_count > 0 AND (added_at_ms, local_id) < (?1, ?2)
        ORDER BY added_at_ms DESC, local_id DESC
        LIMIT ?3",
    position: |row| {
        Ok(Position::Added {
            added_at_ms: row.get(5)?,
            local_id: row.get(0)?,
        })
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeriesOrder {
    Title,
    RecentlyAdded,
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
        (SeriesOrder::Title, None) => rows(connection, &BY_TITLE, (&[], i64::MIN, limit)),
        (SeriesOrder::Title, Some(Position::Title { sort_key, local_id })) => {
            rows(connection, &BY_TITLE, (sort_key, *local_id, limit))
        }
        (SeriesOrder::RecentlyAdded, None) => {
            rows(connection, &BY_RECENTLY_ADDED, (i64::MAX, i64::MAX, limit))
        }
        (
            SeriesOrder::RecentlyAdded,
            Some(Position::Added {
                added_at_ms,
                local_id,
            }),
        ) => rows(
            connection,
            &BY_RECENTLY_ADDED,
            (*added_at_ms, *local_id, limit),
        ),
        (SeriesOrder::Title, Some(Position::Added { .. }))
        | (SeriesOrder::RecentlyAdded, Some(Position::Title { .. })) => {
            return Err(Error::CursorForAnotherList);
        }
    }?;
    Ok(Page::of(rows, request.size))
}

fn rows(
    connection: &Connection,
    listing: &Listing,
    after_and_limit: impl Params,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    let mut statement = connection.prepare(listing.sql)?;
    let rows = statement.query_map(after_and_limit, |row| {
        Ok((summary(row)?, (listing.position)(row)?))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn walks_the_title_index_of_series_with_books_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("title-plan");

        let plan = scratch.query_plan(BY_TITLE.sql);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX series_by_title (title_sort_key>?)"]
        );
    }

    #[test]
    fn walks_the_recently_added_index_of_series_with_books_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("recently-added-plan");

        let plan = scratch.query_plan(BY_RECENTLY_ADDED.sql);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX series_by_added (added_at_ms<?)"]
        );
    }
}
