use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row, ToSql, Transaction, named_params};

use crate::{
    Error,
    catalog::{
        Cover,
        cover::stored_cover,
        cursor::Position,
        page::{Page, PageRequest},
        series_listing::{SeriesFilter, SeriesListing, SeriesOrder, SortDirection, StageParams},
        stored_id::stored_id,
    },
    title_key::{TitleStamp, stored_stamp},
};

const TITLE_KEY_OF_SERIES: &str = "SELECT title_key FROM series WHERE id = ?1";

struct Listing<P> {
    first_page_query: &'static str,
    next_page_query: &'static str,
    sort_position: fn(&Row<'_>) -> rusqlite::Result<P>,
}

/// One order's lists, each way round.
struct Directions<P> {
    ascending: Listing<P>,
    descending: Listing<P>,
}

/// Where a row sits in title order, short of the stamp its key was made under.
struct TitlePlace {
    sort_key: Vec<u8>,
    id: SeriesId,
}

/// The listed series at the stage bound as `$stage`, which hold at least one book.
macro_rules! series_at_stage {
    ($stage:literal) => {
        concat!(
            "SELECT series.id AS id, series.title, series.title_key, series.book_count, series.added_at_ms,
                cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
                series.book_count - series.read_count AS unread_count
            FROM series
            LEFT JOIN book_file AS cover ON cover.id = (
                SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
                FROM book
                WHERE book.series_local_id = series.local_id
                    AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
                ORDER BY book.title_sort_key, book.id
                LIMIT 1
            )
            WHERE series.reading_stage = ",
            $stage
        )
    };
}

/// Merges each stage the filter lets through, read in order from its own stretch of the index, so a filter matching few series reads only those.
macro_rules! listing {
    (seek: $seek:expr, order: $order:expr, sort_position: $position:expr $(,)?) => {
        Listing {
            first_page_query: concat!(
                series_at_stage!(":unstarted"),
                " UNION ALL ",
                series_at_stage!(":in_progress"),
                " UNION ALL ",
                series_at_stage!(":finished"),
                " ORDER BY ",
                $order,
                " LIMIT :limit"
            ),
            next_page_query: concat!(
                series_at_stage!(":unstarted"),
                " AND ",
                $seek,
                " UNION ALL ",
                series_at_stage!(":in_progress"),
                " AND ",
                $seek,
                " UNION ALL ",
                series_at_stage!(":finished"),
                " AND ",
                $seek,
                " ORDER BY ",
                $order,
                " LIMIT :limit"
            ),
            sort_position: $position,
        }
    };
}

/// Both ways round an order on the series column `key`, with the id breaking ties so every row has one place.
macro_rules! directions {
    (key: $key:literal, sort_position: $position:expr $(,)?) => {
        Directions {
            ascending: listing! {
                seek: concat!("(series.", $key, ", series.id) > (:after_key, :after_id)"),
                order: concat!($key, ", id"),
                sort_position: $position,
            },
            descending: listing! {
                seek: concat!("(series.", $key, ", series.id) < (:after_key, :after_id)"),
                order: concat!($key, " DESC, id DESC"),
                sort_position: $position,
            },
        }
    };
}

const BY_TITLE: Directions<TitlePlace> = directions! {
    key: "title_key",
    sort_position: |row| {
        Ok(TitlePlace {
            sort_key: row.get("title_key")?,
            id: stored_id(row, "id")?,
        })
    },
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    key: "added_at_ms",
    sort_position: |row| {
        Ok(Position::Added {
            added_at_ms: row.get("added_at_ms")?,
            id: stored_id(row, "id")?,
        })
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesSummary {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub unread_count: u32,
    pub added_at_ms: i64,
    pub cover: Option<Cover>,
}

/// A title cursor from before the titles were keyed again carries on after its series' new place, or fails with [`Error::StaleCursor`] when that series has gone.
#[tracing::instrument(skip_all, fields(?listing, size = ?request.size))]
pub fn series_page(
    connection: &Connection,
    listing: &SeriesListing,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let read = Read {
        connection,
        filter: listing.filter,
        limit: request.size.rows_to_fetch(),
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let direction = listing.sort.direction;
    let rows = match listing.sort.order {
        SeriesOrder::Title => title_rows(&read, BY_TITLE.toward(direction), after),
        SeriesOrder::DateAdded => date_added_rows(&read, BY_DATE_ADDED.toward(direction), after),
    }?;
    Ok(Page::of(rows, request.size))
}

/// What every page read binds besides where it starts.
struct Read<'c> {
    connection: &'c Connection,
    filter: SeriesFilter,
    limit: i64,
}

/// Reads the stamp and the rows in one snapshot, so a re-key committing meanwhile can't mix keys made under two stamps.
fn title_rows(
    read: &Read<'_>,
    listing: &Listing<TitlePlace>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    let _snapshot = snapshot(read.connection)?;
    let stamp = stored_stamp(read.connection)?;
    let place = after
        .map(|position| place_after(read.connection, stamp, position))
        .transpose()?;
    let rows = match place {
        Some(TitlePlace { sort_key, id }) => listing.rows_after(
            read,
            named_params! { ":after_key": sort_key, ":after_id": id.as_bytes() },
        ),
        None => listing.first_rows(read),
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

fn snapshot(connection: &Connection) -> rusqlite::Result<Option<Transaction<'_>>> {
    if connection.is_autocommit() {
        connection.unchecked_transaction().map(Some)
    } else {
        Ok(None)
    }
}

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

fn date_added_rows(
    read: &Read<'_>,
    listing: &Listing<Position>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => listing.first_rows(read),
        Some(Position::Added { added_at_ms, id }) => listing.rows_after(
            read,
            named_params! { ":after_key": added_at_ms, ":after_id": id.as_bytes() },
        ),
        Some(Position::Title { .. } | Position::Book { .. } | Position::Root { .. }) => {
            Err(Error::CursorForAnotherList)
        }
    }
}

impl<P> Directions<P> {
    const fn toward(&self, direction: SortDirection) -> &Listing<P> {
        match direction {
            SortDirection::Ascending => &self.ascending,
            SortDirection::Descending => &self.descending,
        }
    }
}

impl<P> Listing<P> {
    fn first_rows(&self, read: &Read<'_>) -> Result<Vec<(SeriesSummary, P)>, Error> {
        self.read(read, self.first_page_query, &[])
    }

    fn rows_after(
        &self,
        read: &Read<'_>,
        after: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, P)>, Error> {
        self.read(read, self.next_page_query, after)
    }

    fn read(
        &self,
        read: &Read<'_>,
        sql: &str,
        after: &[(&str, &dyn ToSql)],
    ) -> Result<Vec<(SeriesSummary, P)>, Error> {
        let filter = StageParams::of(read.filter);
        let mut params = filter.named().to_vec();
        params.push((":limit", &read.limit));
        params.extend_from_slice(after);
        let mut statement = read.connection.prepare(sql)?;
        let rows = statement.query_map(params.as_slice(), |row| {
            Ok((summary(row)?, (self.sort_position)(row)?))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

fn summary(row: &Row<'_>) -> rusqlite::Result<SeriesSummary> {
    Ok(SeriesSummary {
        id: stored_id(row, "id")?,
        title: row.get("title")?,
        book_count: row.get("book_count")?,
        unread_count: row.get("unread_count")?,
        added_at_ms: row.get("added_at_ms")?,
        cover: stored_cover(row)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    /// The numbers SQLite gives each stage's two cover subqueries, outer first.
    const COVER_SUBQUERIES_OF_EACH_STAGE: [(u8, u8); 3] = [(3, 1), (7, 5), (11, 9)];

    /// Each listed series finds its first book and that book's first file by index, sorting nothing.
    fn with_covers(series_step: &str, (outer, inner): (u8, u8)) -> Vec<String> {
        vec![
            series_step.to_owned(),
            "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN".to_owned(),
            format!("CORRELATED SCALAR SUBQUERY {outer}"),
            "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?)".to_owned(),
            "SEARCH book_file EXISTS USING COVERING INDEX book_file_by_book (book_id=?)".to_owned(),
            format!("CORRELATED SCALAR SUBQUERY {inner}"),
            "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)".to_owned(),
        ]
    }

    /// Reads each stage in order through `series_step` and merges the three, so no step sorts.
    fn merging_each_stage(series_step: &str) -> Vec<String> {
        let [unstarted, in_progress, finished] =
            COVER_SUBQUERIES_OF_EACH_STAGE.map(|subqueries| with_covers(series_step, subqueries));
        ["MERGE (UNION ALL)", "LEFT", "MERGE (UNION ALL)", "LEFT"]
            .map(ToOwned::to_owned)
            .into_iter()
            .chain(unstarted)
            .chain(["RIGHT".to_owned()])
            .chain(in_progress)
            .chain(["RIGHT".to_owned()])
            .chain(finished)
            .collect()
    }

    fn plans_of<P>(
        scratch: &ScratchLibrary,
        pick: fn(&Listing<P>) -> &'static str,
        directions: &Directions<P>,
    ) -> [Vec<String>; 2] {
        [
            scratch.query_plan(pick(&directions.ascending)),
            scratch.query_plan(pick(&directions.descending)),
        ]
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_title_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-title-plan");

        let plans = plans_of(&scratch, |listing| listing.first_page_query, &BY_TITLE);

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_date_added_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-date-added-plan");

        let plans = plans_of(&scratch, |listing| listing.first_page_query, &BY_DATE_ADDED);

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_added (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_title_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("title-plan");

        let plans = plans_of(&scratch, |listing| listing.next_page_query, &BY_TITLE);

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=? AND (title_key,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=? AND (title_key,id)<(?,?))"
                ),
            ]
        );
    }

    #[test]
    fn seeks_each_stage_of_the_date_added_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("date-added-plan");

        let plans = plans_of(&scratch, |listing| listing.next_page_query, &BY_DATE_ADDED);

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_added (reading_stage=? AND (added_at_ms,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_added (reading_stage=? AND (added_at_ms,id)<(?,?))"
                ),
            ]
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
