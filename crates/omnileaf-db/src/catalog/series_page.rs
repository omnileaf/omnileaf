use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row, Statement, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

/// The first page of a list in some order, the page after a cursor, and the sort values that place a row in that order.
struct Listing {
    first: &'static str,
    after: &'static str,
    position: fn(&Row<'_>) -> rusqlite::Result<Position>,
}

macro_rules! series_with_books {
    () => {
        "SELECT id, title, title_sort_key, book_count, added_at_ms
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

const BY_TITLE: Listing = listing! {
    seek: "(title_sort_key, id) > (:after_key, :after_id)",
    order: "title_sort_key, id",
    position: |row| {
        Ok(Position::Title {
            sort_key: row.get("title_sort_key")?,
            id: stored_id(row, "id")?,
        })
    },
};

const BY_RECENTLY_ADDED: Listing = listing! {
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
#[tracing::instrument(skip_all, fields(?order, size = ?request.size))]
pub fn series_page(
    connection: &Connection,
    order: SeriesOrder,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let limit = request.size.rows_to_fetch();
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let rows = match (order, after) {
        (SeriesOrder::Title, None) => BY_TITLE.first_rows(connection, limit),
        (SeriesOrder::Title, Some(Position::Title { sort_key, id })) => BY_TITLE.rows_after(
            connection,
            named_params! { ":after_key": sort_key, ":after_id": id.as_bytes(), ":limit": limit },
        ),
        (SeriesOrder::RecentlyAdded, None) => BY_RECENTLY_ADDED.first_rows(connection, limit),
        (
            SeriesOrder::RecentlyAdded,
            Some(Position::Added { added_at_ms, id }),
        ) => BY_RECENTLY_ADDED.rows_after(
            connection,
            named_params! { ":after_key": added_at_ms, ":after_id": id.as_bytes(), ":limit": limit },
        ),
        (
            SeriesOrder::Title,
            Some(Position::Added { .. } | Position::Book { .. } | Position::Root { .. }),
        )
        | (
            SeriesOrder::RecentlyAdded,
            Some(Position::Title { .. } | Position::Book { .. } | Position::Root { .. }),
        ) => {
            return Err(Error::CursorForAnotherList);
        }
    }?;
    Ok(Page::of(rows, request.size))
}

impl Listing {
    fn first_rows(
        &self,
        connection: &Connection,
        limit: i64,
    ) -> Result<Vec<(SeriesSummary, Position)>, Error> {
        self.read(
            connection.prepare(self.first)?,
            named_params! { ":limit": limit },
        )
    }

    fn rows_after(
        &self,
        connection: &Connection,
        after_and_limit: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, Position)>, Error> {
        self.read(connection.prepare(self.after)?, after_and_limit)
    }

    fn read(
        &self,
        mut statement: Statement<'_>,
        params: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, Position)>, Error> {
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
            ["SEARCH series USING INDEX series_by_title ((title_sort_key,id)>(?,?))"]
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
}
