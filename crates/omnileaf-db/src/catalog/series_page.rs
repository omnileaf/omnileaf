use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row, Statement, ToSql, Transaction, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
    title_key::{TitleStamp, stored_stamp},
};

const TITLE_KEY_OF_SERIES: &str = "SELECT title_key FROM series WHERE id = ?1";

/// The first page of a list in some order, the page after a cursor, and the sort values that place a row in that order.
struct Listing<P> {
    first: &'static str,
    after: &'static str,
    position: fn(&Row<'_>) -> rusqlite::Result<P>,
}

/// Where a row sits in title order, short of the stamp its key was made under.
struct TitlePlace {
    sort_key: Vec<u8>,
    id: SeriesId,
}

macro_rules! series_with_books {
    () => {
        "SELECT id, title, title_key, book_count, added_at_ms
        FROM series
        WHERE book_count > 0"
    };
}

macro_rules! listing {
    (seek: $seek:literal, order: $order:literal, position: $position:expr $(,)?) => {
        Listing {
            first: concat!(series_with_books!(), " ORDER BY ", $order, " LIMIT :limit"),
            after: concat!(
                series_with_books!(),
                " AND ",
                $seek,
                " ORDER BY ",
                $order,
                " LIMIT :limit"
            ),
            position: $position,
        }
    };
}

const BY_TITLE: Listing<TitlePlace> = listing! {
    seek: "(title_key, id) > (:after_key, :after_id)",
    order: "title_key, id",
    position: |row| {
        Ok(TitlePlace {
            sort_key: row.get("title_key")?,
            id: stored_id(row, "id")?,
        })
    },
};

const BY_RECENTLY_ADDED: Listing<Position> = listing! {
    seek: "(added_at_ms, id) < (:after_key, :after_id)",
    order: "added_at_ms DESC, id DESC",
    position: |row| {
        Ok(Position::Added {
            added_at_ms: row.get("added_at_ms")?,
            id: stored_id(row, "id")?,
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
///
/// A title cursor from before the titles were keyed again carries on after its series' new place, or fails with [`Error::StaleCursor`] when that series has gone.
#[tracing::instrument(skip_all, fields(?order, size = ?request.size))]
pub fn series_page(
    connection: &Connection,
    order: SeriesOrder,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let limit = request.size.rows_to_fetch();
    let rows = match order {
        SeriesOrder::Title => title_rows(connection, after, limit),
        SeriesOrder::RecentlyAdded => recently_added_rows(connection, after, limit),
    }?;
    Ok(Page::of(rows, request.size))
}

/// Reads the stamp and the rows in one snapshot, so a re-key committing meanwhile can't mix keys made under two stamps.
fn title_rows(
    connection: &Connection,
    after: Option<&Position>,
    limit: i64,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    let _snapshot = snapshot(connection)?;
    let stamp = stored_stamp(connection)?;
    let place = after
        .map(|position| place_after(connection, stamp, position))
        .transpose()?;
    let rows = match place {
        Some(TitlePlace { sort_key, id }) => BY_TITLE.rows_after(
            connection,
            named_params! { ":after_key": sort_key, ":after_id": id.as_bytes(), ":limit": limit },
        ),
        None => BY_TITLE.first_rows(connection, limit),
    }?;
    Ok(rows
        .into_iter()
        .map(|(series, TitlePlace { sort_key, id })| {
            let position = Position::Title {
                stamp,
                sort_key,
                id,
            };
            (series, position)
        })
        .collect())
}

/// Begins a read transaction unless the caller is in one already, which holds one snapshot by itself.
fn snapshot(connection: &Connection) -> rusqlite::Result<Option<Transaction<'_>>> {
    if connection.is_autocommit() {
        connection.unchecked_transaction().map(Some)
    } else {
        Ok(None)
    }
}

/// The cursor's place under the current stamp, which is its series' new key when the titles were keyed again since.
fn place_after(
    connection: &Connection,
    current: TitleStamp,
    after: &Position,
) -> Result<TitlePlace, Error> {
    match after {
        Position::Title {
            stamp,
            sort_key,
            id,
        } if *stamp == current => Ok(TitlePlace {
            sort_key: sort_key.clone(),
            id: *id,
        }),
        Position::Title { id, .. } => connection
            .prepare(TITLE_KEY_OF_SERIES)?
            .query_row([id.as_bytes()], |row| row.get(0))
            .optional()?
            .map(|sort_key| TitlePlace { sort_key, id: *id })
            .ok_or(Error::StaleCursor),
        Position::Added { .. } | Position::Book { .. } | Position::Root { .. } => {
            Err(Error::CursorForAnotherList)
        }
    }
}

fn recently_added_rows(
    connection: &Connection,
    after: Option<&Position>,
    limit: i64,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => BY_RECENTLY_ADDED.first_rows(connection, limit),
        Some(Position::Added { added_at_ms, id }) => BY_RECENTLY_ADDED.rows_after(
            connection,
            named_params! { ":after_key": added_at_ms, ":after_id": id.as_bytes(), ":limit": limit },
        ),
        Some(Position::Title { .. } | Position::Book { .. } | Position::Root { .. }) => {
            Err(Error::CursorForAnotherList)
        }
    }
}

impl<P> Listing<P> {
    fn first_rows(
        &self,
        connection: &Connection,
        limit: i64,
    ) -> Result<Vec<(SeriesSummary, P)>, Error> {
        self.read(
            connection.prepare(self.first)?,
            named_params! { ":limit": limit },
        )
    }

    fn rows_after(
        &self,
        connection: &Connection,
        after_and_limit: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, P)>, Error> {
        self.read(connection.prepare(self.after)?, after_and_limit)
    }

    fn read(
        &self,
        mut statement: Statement<'_>,
        params: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, P)>, Error> {
        let rows = statement.query_map(params, |row| Ok((summary(row)?, (self.position)(row)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

fn summary(row: &Row<'_>) -> rusqlite::Result<SeriesSummary> {
    Ok(SeriesSummary {
        id: stored_id(row, "id")?,
        title: row.get("title")?,
        book_count: row.get("book_count")?,
        added_at_ms: row.get("added_at_ms")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn starts_at_the_head_of_the_title_index_without_reading_the_table_or_sorting() {
        let scratch = ScratchLibrary::new("first-title-plan");

        let plan = scratch.query_plan(BY_TITLE.first);

        assert_eq!(plan, ["SCAN series USING INDEX series_by_title"]);
    }

    #[test]
    fn starts_at_the_head_of_the_recently_added_index_without_reading_the_table_or_sorting() {
        let scratch = ScratchLibrary::new("first-recently-added-plan");

        let plan = scratch.query_plan(BY_RECENTLY_ADDED.first);

        assert_eq!(plan, ["SCAN series USING INDEX series_by_added"]);
    }

    #[test]
    fn seeks_the_title_index_on_both_sort_columns_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("title-plan");

        let plan = scratch.query_plan(BY_TITLE.after);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX series_by_title ((title_key,id)>(?,?))"]
        );
    }

    #[test]
    fn seeks_the_recently_added_index_on_both_sort_columns_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("recently-added-plan");

        let plan = scratch.query_plan(BY_RECENTLY_ADDED.after);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX series_by_added ((added_at_ms,id)<(?,?))"]
        );
    }

    #[test]
    fn finds_the_new_key_of_a_cursor_s_series_by_its_id() {
        let scratch = ScratchLibrary::new("title-key-of-series-plan");

        let plan = scratch.query_plan(TITLE_KEY_OF_SERIES);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX sqlite_autoindex_series_1 (id=?)"]
        );
    }
}
