use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row, ToSql, Transaction, named_params};

use crate::{
    Error,
    catalog::{
        cover::stored_cover,
        cursor::Position,
        gathering::stages_holding_matches,
        series_listing::{FilterParams, SeriesFilter},
        series_page::SeriesSummary,
        stored_id::{stored_id, stored_optional_id},
    },
    title_key::{TitleStamp, stored_stamp},
};

const TITLE_KEY_OF_SERIES: &str = "SELECT title_key FROM series WHERE id = ?1";

pub(crate) struct Listing<P> {
    pub(crate) first_page_query: &'static str,
    pub(crate) next_page_query: &'static str,
    pub(crate) sort_position: fn(&Row<'_>) -> rusqlite::Result<P>,
}

pub(crate) struct TitlePlace {
    pub(crate) sort_key: Vec<u8>,
    pub(crate) id: SeriesId,
}

macro_rules! summary_columns {
    () => {
        "SELECT series.id AS id, series.title, series.title_key, series.book_count, series.added_at_ms,
            series.last_read_at_ms, series.updated_at_ms, series.time_left_key,
            cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
            series.unread_count, series.language, series.adult_rated_books - series.marked_adult > 0 AS is_rated_adult,
            series.marked_adult = 1 AS is_marked_adult, "
    };
}

/// The listed series at the stage bound as `$stage` that meet `$condition`, which hold at least one book.
macro_rules! series_at_stage {
    (
        stage: $stage:literal,
        continues_from: $continues_from:expr,
        condition: $condition:expr $(,)?
    ) => {
        concat!(
            $crate::catalog::staged_rows::summary_columns!(),
            $continues_from,
            " AS continues_from
            FROM series ",
            $crate::catalog::cover::join_series_cover!(),
            " WHERE series.reading_stage = ",
            $stage,
            $crate::catalog::series_listing::smart_conditions!(),
            $condition
        )
    };
}

/// Merges each stage the filter lets through, read in order from its own stretch of the index, so a filter matching few series reads only those.
macro_rules! listing {
    (
        with: $with:expr,
        condition: $condition:expr,
        seek: $seek:expr,
        order: $order:expr,
        sort_position: $position:expr $(,)?
    ) => {
        $crate::catalog::staged_rows::Listing {
            first_page_query: concat!(
                $with,
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":unstarted",
                    continues_from: "NULL",
                    condition: $condition,
                },
                " UNION ALL ",
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":in_progress",
                    continues_from: $crate::catalog::series_books::book_up_next!(),
                    condition: $condition,
                },
                " UNION ALL ",
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":finished",
                    continues_from: "NULL",
                    condition: $condition,
                },
                " ORDER BY ",
                $order,
                " LIMIT :limit"
            ),
            next_page_query: concat!(
                $with,
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":unstarted",
                    continues_from: "NULL",
                    condition: $condition,
                },
                " AND ",
                $seek,
                " UNION ALL ",
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":in_progress",
                    continues_from: $crate::catalog::series_books::book_up_next!(),
                    condition: $condition,
                },
                " AND ",
                $seek,
                " UNION ALL ",
                $crate::catalog::staged_rows::series_at_stage! {
                    stage: ":finished",
                    continues_from: "NULL",
                    condition: $condition,
                },
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

pub(crate) use listing;
pub(crate) use series_at_stage;
pub(crate) use summary_columns;

pub(crate) struct Read<'c> {
    pub(crate) connection: &'c Connection,
    pub(crate) filter: &'c SeriesFilter,
    pub(crate) limit: i64,
    pub(crate) bound: &'c [(&'static str, &'c dyn ToSql)],
}

pub(crate) fn title_place(row: &Row<'_>) -> rusqlite::Result<TitlePlace> {
    Ok(TitlePlace {
        sort_key: row.get("title_key")?,
        id: stored_id(row, "id")?,
    })
}

/// Reads the stamp and the rows in one snapshot, so a re-key committing meanwhile can't mix keys made under two stamps.
pub(crate) fn title_rows(
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

/// Begins a read transaction unless the caller is in one already, which holds one snapshot by itself.
pub(crate) fn snapshot(connection: &Connection) -> rusqlite::Result<Option<Transaction<'_>>> {
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
        Position::Added { .. }
        | Position::Book { .. }
        | Position::Root { .. }
        | Position::LastRead { .. }
        | Position::Session { .. }
        | Position::LastUpdated { .. }
        | Position::UnreadCount { .. }
        | Position::TimeLeft { .. }
        | Position::Writer { .. }
        | Position::FolderGroup { .. } => Err(Error::CursorForAnotherList),
    }
}

impl<P> Listing<P> {
    pub(crate) fn first_rows(&self, read: &Read<'_>) -> Result<Vec<(SeriesSummary, P)>, Error> {
        self.read(read, self.first_page_query, &[])
    }

    pub(crate) fn rows_after(
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
        let _snapshot = snapshot(read.connection)?;
        let stages = stages_holding_matches(read.connection, read.filter)?;
        let filter = FilterParams::with_stages(read.filter, stages);
        let mut params = filter.named().to_vec();
        params.push((":limit", &read.limit));
        params.extend_from_slice(read.bound);
        params.extend_from_slice(after);
        let mut statement = read.connection.prepare_cached(sql)?;
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
        continues_from: stored_optional_id(row, "continues_from")?,
        language: row.get("language")?,
        is_rated_adult: row.get("is_rated_adult")?,
        is_marked_adult: row.get("is_marked_adult")?,
    })
}

#[cfg(test)]
pub(crate) mod plans {
    const TAG_SUBQUERIES_OF_EACH_STAGE: [u8; 3] = [2, 7, 10];
    const IN_PROGRESS_BOOK_UP_NEXT_SUBQUERIES: (u8, u8) = (4, 5);

    pub(crate) fn merging_each_stage(series_step: &str) -> Vec<String> {
        let [unstarted, in_progress, finished] = [0, 1, 2].map(|stage| {
            with_covers(with_tag_probe(
                vec![series_step.to_owned()],
                TAG_SUBQUERIES_OF_EACH_STAGE[stage],
            ))
        });
        merging([
            unstarted,
            continuing_from_the_book_up_next(in_progress, IN_PROGRESS_BOOK_UP_NEXT_SUBQUERIES),
            finished,
        ])
    }

    /// The steps of the check a page makes on each series it walks past, that it carries a chosen tag, whose list of chosen tags SQLite numbers one before it.
    pub(crate) fn tag_probe_steps(subquery: u8) -> Vec<String> {
        [
            format!("CORRELATED SCALAR SUBQUERY {subquery}"),
            "SEARCH series_tag USING PRIMARY KEY (series_local_id=? AND name=?)".to_owned(),
            format!("LIST SUBQUERY {}", subquery - 1),
            "SCAN json_each VIRTUAL TABLE INDEX 1:".to_owned(),
        ]
        .into()
    }

    /// The steps of the list a count reads once, of the series carrying a chosen tag.
    pub(crate) fn tag_list_steps(subquery: u8) -> Vec<String> {
        [
            format!("LIST SUBQUERY {subquery}"),
            "SCAN wanted VIRTUAL TABLE INDEX 1:".to_owned(),
            "SEARCH series_tag USING COVERING INDEX series_tag_by_name (name=?)".to_owned(),
            "CREATE BLOOM FILTER".to_owned(),
        ]
        .into()
    }

    /// The tag probe's steps placed after the first step of a plan.
    pub(crate) fn with_tag_probe(
        steps: impl IntoIterator<Item = String>,
        subquery: u8,
    ) -> Vec<String> {
        let mut steps = steps.into_iter();
        steps
            .next()
            .into_iter()
            .chain(tag_probe_steps(subquery))
            .chain(steps)
            .collect()
    }

    pub(crate) fn continuing_from_the_book_up_next(
        stage_steps: Vec<String>,
        subqueries: (u8, u8),
    ) -> Vec<String> {
        stage_steps
            .into_iter()
            .chain(finding_the_book_up_next(subqueries))
            .collect()
    }

    pub(crate) fn finding_the_book_up_next((started, unread): (u8, u8)) -> Vec<String> {
        [started, unread]
            .into_iter()
            .flat_map(|subquery| {
                [
                    format!("CORRELATED SCALAR SUBQUERY {subquery}"),
                    "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?)"
                        .to_owned(),
                    "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN".to_owned(),
                ]
            })
            .collect()
    }

    pub(crate) fn with_covers(stage_steps: Vec<String>) -> Vec<String> {
        stage_steps
            .into_iter()
            .chain(["SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN".to_owned()])
            .collect()
    }

    pub(crate) fn merging([unstarted, in_progress, finished]: [Vec<String>; 3]) -> Vec<String> {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

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
