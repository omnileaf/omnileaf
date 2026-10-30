use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, named_params};

use crate::{
    Error,
    catalog::{
        Cover,
        cursor::Position,
        gathering::{Gathering, Gatherings, gatherings},
        page::{Page, PageRequest},
        series_listing::{SeriesListing, SeriesOrder, SortDirection},
        staged_rows::{Listing, Read, TitlePlace, title_place, title_rows},
        stored_id::stored_id,
        value_list::json_list,
    },
};

pub(crate) struct Directions<P> {
    pub(crate) ascending: Listing<P>,
    pub(crate) descending: Listing<P>,
}

/// Both ways round an order on the series column `key`, with the id breaking ties so every row has one place, among the series that meet `condition`.
macro_rules! directions {
    (key: $key:literal, sort_position: $position:expr $(,)?) => {
        $crate::catalog::series_page::directions! {
            with: "",
            condition: "",
            key: $key,
            sort_position: $position,
        }
    };
    (
        with: $with:expr,
        condition: $condition:expr,
        key: $key:literal,
        sort_position: $position:expr $(,)?
    ) => {
        $crate::catalog::series_page::Directions {
            ascending: $crate::catalog::staged_rows::listing! {
                with: $with,
                condition: $condition,
                seek: concat!("(series.", $key, ", series.id) > (:after_key, :after_id)"),
                order: concat!($key, ", id"),
                sort_position: $position,
            },
            descending: $crate::catalog::staged_rows::listing! {
                with: $with,
                condition: $condition,
                seek: concat!("(series.", $key, ", series.id) < (:after_key, :after_id)"),
                order: concat!($key, " DESC, id DESC"),
                sort_position: $position,
            },
        }
    };
}

pub(crate) use directions;

const BY_TITLE: Gatherings<TitlePlace> = gatherings! {
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Gatherings<Position> = gatherings! {
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Gatherings<Position> = gatherings! {
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED: Gatherings<Position> = gatherings! {
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT: Gatherings<Position> = gatherings! {
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT: Gatherings<Position> = gatherings! {
    key: "time_left_key",
    sort_position: time_left_place,
};

pub(crate) fn time_left_place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::TimeLeft {
        time_left_key: row.get("time_left_key")?,
        id: stored_id(row, "id")?,
    })
}

pub(crate) fn unread_count_place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::UnreadCount {
        unread_count: row.get("unread_count")?,
        id: stored_id(row, "id")?,
    })
}

pub(crate) fn last_updated_place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::LastUpdated {
        updated_at_ms: row.get("updated_at_ms")?,
        id: stored_id(row, "id")?,
    })
}

pub(crate) fn last_read_place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::LastRead {
        last_read_at_ms: row.get("last_read_at_ms")?,
        id: stored_id(row, "id")?,
    })
}

pub(crate) fn added_place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::Added {
        added_at_ms: row.get("added_at_ms")?,
        id: stored_id(row, "id")?,
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesSummary {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub unread_count: u32,
    pub added_at_ms: i64,
    pub cover: Option<Cover>,
    pub continues_from: Option<BookId>,
    pub language: Option<String>,
    pub is_rated_adult: bool,
    pub is_marked_adult: bool,
}

/// A title cursor from before the titles were keyed again carries on after its series' new place, or fails with [`Error::StaleCursor`] when that series has gone.
#[tracing::instrument(skip_all, fields(?listing, size = ?request.size))]
pub fn series_page(
    connection: &Connection,
    listing: &SeriesListing,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let gathering = Gathering::of(connection, &listing.filter)?;
    let languages = json_list(&listing.filter.languages);
    let read = Read {
        connection,
        filter: &listing.filter,
        limit: request.size.rows_to_fetch(),
        bound: match gathering {
            Gathering::FewInLanguages => &[(":language_list", &languages)],
            Gathering::EachStageInOrder
            | Gathering::FewForgotten
            | Gathering::FewDuplicated
            | Gathering::FewQuickReads
            | Gathering::FewRatedAdult
            | Gathering::FewTagged
            | Gathering::FewManga
            | Gathering::FewBookmarked => &[],
        },
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let direction = listing.sort.direction;
    let rows = match listing.sort.order {
        SeriesOrder::Title => title_rows(&read, BY_TITLE.toward(gathering, direction), after),
        SeriesOrder::DateAdded => {
            date_added_rows(&read, BY_DATE_ADDED.toward(gathering, direction), after)
        }
        SeriesOrder::LastRead => {
            last_read_rows(&read, BY_LAST_READ.toward(gathering, direction), after)
        }
        SeriesOrder::LastUpdated => {
            last_updated_rows(&read, BY_LAST_UPDATED.toward(gathering, direction), after)
        }
        SeriesOrder::UnreadCount => {
            unread_count_rows(&read, BY_UNREAD_COUNT.toward(gathering, direction), after)
        }
        SeriesOrder::TimeLeft => {
            time_left_rows(&read, BY_TIME_LEFT.toward(gathering, direction), after)
        }
    }?;
    Ok(Page::of(rows, request.size))
}

pub(crate) fn time_left_rows(
    read: &Read<'_>,
    listing: &Listing<Position>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => listing.first_rows(read),
        Some(Position::TimeLeft { time_left_key, id }) => listing.rows_after(
            read,
            named_params! { ":after_key": time_left_key, ":after_id": id.as_bytes() },
        ),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

pub(crate) fn unread_count_rows(
    read: &Read<'_>,
    listing: &Listing<Position>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => listing.first_rows(read),
        Some(Position::UnreadCount { unread_count, id }) => listing.rows_after(
            read,
            named_params! { ":after_key": unread_count, ":after_id": id.as_bytes() },
        ),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

pub(crate) fn last_updated_rows(
    read: &Read<'_>,
    listing: &Listing<Position>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => listing.first_rows(read),
        Some(Position::LastUpdated { updated_at_ms, id }) => listing.rows_after(
            read,
            named_params! { ":after_key": updated_at_ms, ":after_id": id.as_bytes() },
        ),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

pub(crate) fn last_read_rows(
    read: &Read<'_>,
    listing: &Listing<Position>,
    after: Option<&Position>,
) -> Result<Vec<(SeriesSummary, Position)>, Error> {
    match after {
        None => listing.first_rows(read),
        Some(Position::LastRead {
            last_read_at_ms,
            id,
        }) => listing.rows_after(
            read,
            named_params! { ":after_key": last_read_at_ms, ":after_id": id.as_bytes() },
        ),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

pub(crate) fn date_added_rows(
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
        Some(
            Position::Title { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

impl<P> Directions<P> {
    pub(crate) const fn toward(&self, direction: SortDirection) -> &Listing<P> {
        match direction {
            SortDirection::Ascending => &self.ascending,
            SortDirection::Descending => &self.descending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        catalog::staged_rows::plans::{
            continuing_from_the_book_up_next, merging_each_stage, tag_list_steps, tag_probe_steps,
            with_covers, with_tag_probe,
        },
        scratch::ScratchLibrary,
    };

    const BOOK_UP_NEXT_SUBQUERIES_OF_THE_PAGE: (u8, u8) = (4, 5);

    fn every_page_query_of<P>(directions: &Directions<P>) -> [&'static str; 4] {
        [
            directions.ascending.first_page_query,
            directions.ascending.next_page_query,
            directions.descending.first_page_query,
            directions.descending.next_page_query,
        ]
    }

    fn few_gathered_in_every_order(
        pick: fn(&Gatherings<Position>) -> &Directions<Position>,
    ) -> Vec<&'static str> {
        [
            BY_DATE_ADDED,
            BY_LAST_READ,
            BY_LAST_UPDATED,
            BY_UNREAD_COUNT,
            BY_TIME_LEFT,
        ]
        .iter()
        .flat_map(|gatherings| every_page_query_of(pick(gatherings)))
        .collect()
    }

    fn sorting_only_the_page(gathered: &str) -> Vec<String> {
        sorting_the_page_gathered_by(
            with_tag_probe(vec![gathered.to_owned()], 2),
            BOOK_UP_NEXT_SUBQUERIES_OF_THE_PAGE,
        )
    }

    fn sorting_the_page_gathered_by(gathered: Vec<String>, book_up_next: (u8, u8)) -> Vec<String> {
        let rows_of_the_page = with_covers(vec![
            "SCAN page".to_owned(),
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)".to_owned(),
        ]);
        ["MATERIALIZE page".to_owned()]
            .into_iter()
            .chain(gathered)
            .chain(["USE TEMP B-TREE FOR ORDER BY".to_owned()])
            .chain(continuing_from_the_book_up_next(
                rows_of_the_page,
                book_up_next,
            ))
            .chain(["USE TEMP B-TREE FOR ORDER BY".to_owned()])
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

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_TITLE.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_date_added_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-date-added-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_DATE_ADDED.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_added (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_last_read_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-last-read-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_LAST_READ.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_last_read_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("last-read-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_LAST_READ.each_stage_in_order,
        );

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=? AND (last_read_at_ms,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=? AND (last_read_at_ms,id)<(?,?))"
                ),
            ]
        );
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_last_updated_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-last-updated-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_LAST_UPDATED.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_updated (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_last_updated_index_either_way_on_both_sort_columns_without_sorting()
    {
        let scratch = ScratchLibrary::new("last-updated-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_LAST_UPDATED.each_stage_in_order,
        );

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_updated (reading_stage=? AND (updated_at_ms,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_updated (reading_stage=? AND (updated_at_ms,id)<(?,?))"
                ),
            ]
        );
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_unread_count_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-unread-count-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_UNREAD_COUNT.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_unread (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_unread_count_index_either_way_on_both_sort_columns_without_sorting()
    {
        let scratch = ScratchLibrary::new("unread-count-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_UNREAD_COUNT.each_stage_in_order,
        );

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_unread (reading_stage=? AND (unread_count,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_unread (reading_stage=? AND (unread_count,id)<(?,?))"
                ),
            ]
        );
    }

    #[test]
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_time_left_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-time-left-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.first_page_query,
            &BY_TIME_LEFT.each_stage_in_order,
        );

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_time_left_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("time-left-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_TIME_LEFT.each_stage_in_order,
        );

        assert_eq!(
            plans,
            [
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=? AND (time_left_key,id)>(?,?))"
                ),
                merging_each_stage(
                    "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=? AND (time_left_key,id)<(?,?))"
                ),
            ]
        );
    }

    #[test]
    fn seeks_each_stage_of_the_title_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("title-plan");

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_TITLE.each_stage_in_order,
        );

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

        let plans = plans_of(
            &scratch,
            |listing| listing.next_page_query,
            &BY_DATE_ADDED.each_stage_in_order,
        );

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
    fn gathers_the_few_forgotten_series_by_when_each_was_last_read_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-forgotten-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_forgotten)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_forgotten
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=? AND last_read_at_ms>? AND last_read_at_ms<?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_series_holding_a_book_stored_twice_by_their_own_index_then_sorts_only_their_keys()
     {
        let scratch = ScratchLibrary::new("few-duplicated-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_duplicated)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_duplicated
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_with_duplicates_by_stage (reading_stage=?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_quick_reads_through_the_pages_left_index_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-quick-reads-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_quick)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_quick
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=? AND time_left_key>? AND time_left_key<?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_series_rated_18_plus_by_their_own_index_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-rated-adult-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_rated_adult)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_rated_adult
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_rated_adult_by_stage (reading_stage=?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_series_in_a_chosen_language_by_the_language_index_then_sorts_only_their_keys()
     {
        let scratch = ScratchLibrary::new("few-in-languages-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_in_languages)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_in_languages
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_the_page_gathered_by(
            [
                "SEARCH series USING INDEX series_by_language (language=? AND reading_stage=?)",
                "LIST SUBQUERY 1",
                "SCAN json_each VIRTUAL TABLE INDEX 1:",
            ]
            .map(ToOwned::to_owned)
            .into_iter()
            .chain(tag_probe_steps(3))
            .collect(),
            (5, 6),
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_series_carrying_a_chosen_tag_by_the_tag_index_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-tagged-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_tagged)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_tagged
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let candidates_by_tag = tag_list_steps(1)
            .into_iter()
            .filter(|step| step != "CREATE BLOOM FILTER");
        let gathered = sorting_the_page_gathered_by(
            ["SEARCH series USING INTEGER PRIMARY KEY (rowid=?)".to_owned()]
                .into_iter()
                .chain(candidates_by_tag)
                .collect(),
            (3, 4),
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_manga_series_by_their_own_index_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-manga-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_manga)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_manga
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_manga_by_stage (reading_stage=?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }

    #[test]
    fn gathers_the_few_bookmarked_series_by_their_own_index_then_sorts_only_their_keys() {
        let scratch = ScratchLibrary::new("few-bookmarked-plan");
        let queries: Vec<&str> = every_page_query_of(&BY_TITLE.few_bookmarked)
            .into_iter()
            .chain(few_gathered_in_every_order(|gatherings| {
                &gatherings.few_bookmarked
            }))
            .collect();

        let plans: Vec<Vec<String>> = queries
            .iter()
            .map(|query| scratch.query_plan(query))
            .collect();

        let gathered = sorting_only_the_page(
            "SEARCH series USING INDEX series_bookmarked_by_stage (reading_stage=?)",
        );
        assert_eq!(plans, vec![gathered; queries.len()]);
    }
}
