use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row, named_params};

use crate::{
    Error,
    catalog::{
        Cover,
        cursor::Position,
        page::{Page, PageRequest},
        series_listing::{SeriesListing, SeriesOrder, SortDirection},
        staged_rows::{Listing, Read, TitlePlace, title_place, title_rows},
        stored_id::stored_id,
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

const BY_TITLE: Directions<TitlePlace> = directions! {
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Directions<Position> = directions! {
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED: Directions<Position> = directions! {
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT: Directions<Position> = directions! {
    key: "unread_count",
    sort_position: unread_count_place,
};

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
        bound: &[],
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let direction = listing.sort.direction;
    let rows = match listing.sort.order {
        SeriesOrder::Title => title_rows(&read, BY_TITLE.toward(direction), after),
        SeriesOrder::DateAdded => date_added_rows(&read, BY_DATE_ADDED.toward(direction), after),
        SeriesOrder::LastRead => last_read_rows(&read, BY_LAST_READ.toward(direction), after),
        SeriesOrder::LastUpdated => {
            last_updated_rows(&read, BY_LAST_UPDATED.toward(direction), after)
        }
        SeriesOrder::UnreadCount => {
            unread_count_rows(&read, BY_UNREAD_COUNT.toward(direction), after)
        }
    }?;
    Ok(Page::of(rows, request.size))
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
            | Position::LastUpdated { .. },
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
            | Position::UnreadCount { .. },
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
            | Position::UnreadCount { .. },
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
            | Position::UnreadCount { .. },
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
    use crate::{catalog::staged_rows::plans::merging_each_stage, scratch::ScratchLibrary};

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
    fn starts_each_stage_at_either_end_of_its_stretch_of_the_last_read_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-last-read-plan");

        let plans = plans_of(&scratch, |listing| listing.first_page_query, &BY_LAST_READ);

        let from_the_head = merging_each_stage(
            "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=?)",
        );
        assert_eq!(plans, [from_the_head.clone(), from_the_head]);
    }

    #[test]
    fn seeks_each_stage_of_the_last_read_index_either_way_on_both_sort_columns_without_sorting() {
        let scratch = ScratchLibrary::new("last-read-plan");

        let plans = plans_of(&scratch, |listing| listing.next_page_query, &BY_LAST_READ);

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
            &BY_LAST_UPDATED,
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
            &BY_LAST_UPDATED,
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
            &BY_UNREAD_COUNT,
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
            &BY_UNREAD_COUNT,
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
}
