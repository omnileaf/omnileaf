use omnileaf_sync_proto::CategoryId;
use rusqlite::{Connection, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        gathering::sorted_directions,
        page::{Page, PageRequest},
        series_listing::{
            FilterParams, SeriesFilter, SeriesListing, SeriesOrder, SortDirection,
            counted_conditions,
        },
        series_page::{
            Directions, SeriesSummary, added_place, date_added_rows, directions, last_read_place,
            last_read_rows, last_updated_place, last_updated_rows, time_left_place, time_left_rows,
            unread_count_place, unread_count_rows,
        },
        staged_rows::{Listing, Read, TitlePlace, title_place, title_rows},
    },
};

macro_rules! series_in_category {
    () => {
        "SELECT series.local_id FROM series_category
            JOIN series ON series.id = series_category.series_id
            WHERE series_category.category_id = :category"
    };
}

const BY_TITLE: Directions<TitlePlace> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Directions<Position> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED: Directions<Position> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT: Directions<Position> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT: Directions<Position> = directions! {
    with: concat!("WITH in_category AS MATERIALIZED (", series_in_category!(), ") "),
    condition: " AND series.local_id IN in_category",
    key: "time_left_key",
    sort_position: time_left_place,
};

const FEW_IN_CATEGORY: i64 = 1_500;

const CATEGORY_IS_FEW: &str = "SELECT count(*) < :few FROM (
    SELECT 1 FROM series_category WHERE category_id = :category LIMIT :few)";

macro_rules! members_of_category {
    () => {
        " FROM series_category CROSS JOIN series ON series.id = series_category.series_id
            WHERE series_category.category_id = :category
                AND series.reading_stage IN (:unstarted, :in_progress, :finished)"
    };
}

const BY_TITLE_SORTED: Directions<TitlePlace> = sorted_directions! {
    candidates: members_of_category!(),
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED_SORTED: Directions<Position> = sorted_directions! {
    candidates: members_of_category!(),
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ_SORTED: Directions<Position> = sorted_directions! {
    candidates: members_of_category!(),
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED_SORTED: Directions<Position> = sorted_directions! {
    candidates: members_of_category!(),
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT_SORTED: Directions<Position> = sorted_directions! {
    candidates: members_of_category!(),
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT_SORTED: Directions<Position> = sorted_directions! {
    candidates: members_of_category!(),
    key: "time_left_key",
    sort_position: time_left_place,
};

fn listing_toward<'a, P>(
    few: bool,
    (in_stages, sorted): (&'a Directions<P>, &'a Directions<P>),
    direction: SortDirection,
) -> &'a Listing<P> {
    if few { sorted } else { in_stages }.toward(direction)
}

fn category_is_few(connection: &Connection, category: &[u8; 16]) -> Result<bool, Error> {
    Ok(connection.prepare(CATEGORY_IS_FEW)?.query_row(
        named_params! { ":few": FEW_IN_CATEGORY, ":category": category },
        |row| row.get(0),
    )?)
}

const SERIES_IN_CATEGORY: &str = concat!(
    "SELECT count(*)",
    members_of_category!(),
    counted_conditions!()
);

#[tracing::instrument(skip_all, fields(?listing, size = ?request.size))]
pub fn category_series_page(
    connection: &Connection,
    category: CategoryId,
    listing: &SeriesListing,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let category_bytes = category.as_bytes();
    let bound: [(&'static str, &dyn ToSql); 1] = [(":category", &category_bytes)];
    let read = Read {
        connection,
        filter: &listing.filter,
        limit: request.size.rows_to_fetch(),
        bound: &bound,
    };
    let few = category_is_few(connection, category_bytes)?;
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let direction = listing.sort.direction;
    let rows = match listing.sort.order {
        SeriesOrder::Title => title_rows(
            &read,
            listing_toward(few, (&BY_TITLE, &BY_TITLE_SORTED), direction),
            after,
        ),
        SeriesOrder::DateAdded => date_added_rows(
            &read,
            listing_toward(few, (&BY_DATE_ADDED, &BY_DATE_ADDED_SORTED), direction),
            after,
        ),
        SeriesOrder::LastRead => last_read_rows(
            &read,
            listing_toward(few, (&BY_LAST_READ, &BY_LAST_READ_SORTED), direction),
            after,
        ),
        SeriesOrder::LastUpdated => last_updated_rows(
            &read,
            listing_toward(few, (&BY_LAST_UPDATED, &BY_LAST_UPDATED_SORTED), direction),
            after,
        ),
        SeriesOrder::UnreadCount => unread_count_rows(
            &read,
            listing_toward(few, (&BY_UNREAD_COUNT, &BY_UNREAD_COUNT_SORTED), direction),
            after,
        ),
        SeriesOrder::TimeLeft => time_left_rows(
            &read,
            listing_toward(few, (&BY_TIME_LEFT, &BY_TIME_LEFT_SORTED), direction),
            after,
        ),
    }?;
    Ok(Page::of(rows, request.size))
}

#[tracing::instrument(skip_all, fields(?filter))]
pub fn category_series_count(
    connection: &Connection,
    category: CategoryId,
    filter: &SeriesFilter,
) -> Result<u32, Error> {
    let category_bytes = category.as_bytes();
    let filter = FilterParams::of(filter);
    let mut params = filter.named().to_vec();
    params.push((":category", &category_bytes));
    Ok(connection
        .prepare(SERIES_IN_CATEGORY)?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    const IN_CATEGORY: &str =
        "SEARCH series_category USING COVERING INDEX series_category_by_category (category_id=?)";

    #[test]
    fn gathers_the_category_s_series_once_from_its_index_and_reads_each_stage_in_order() {
        let scratch = ScratchLibrary::new("category-series-plan");

        let plans = [
            BY_TITLE.ascending.first_page_query,
            BY_TITLE.descending.next_page_query,
            BY_DATE_ADDED.ascending.first_page_query,
            BY_DATE_ADDED.descending.next_page_query,
            BY_LAST_READ.ascending.first_page_query,
            BY_LAST_READ.descending.next_page_query,
            BY_LAST_UPDATED.ascending.first_page_query,
            BY_LAST_UPDATED.descending.next_page_query,
            BY_UNREAD_COUNT.ascending.first_page_query,
            BY_UNREAD_COUNT.descending.next_page_query,
            BY_TIME_LEFT.ascending.first_page_query,
            BY_TIME_LEFT.descending.next_page_query,
        ]
        .map(|query| scratch.query_plan(query));

        for plan in plans {
            let gathered = plan
                .iter()
                .filter(|step| *step == "MATERIALIZE in_category")
                .count();
            assert_eq!(gathered, 1, "{plan:?}");
            assert!(plan.iter().any(|step| step == IN_CATEGORY), "{plan:?}");
            assert!(
                !plan.iter().any(|step| step.contains("ORDER BY")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn sorts_a_few_members_of_the_category_whichever_page_it_reads() {
        let scratch = ScratchLibrary::new("category-series-sorted-plan");

        let plans = [
            BY_TITLE_SORTED.ascending.first_page_query,
            BY_TITLE_SORTED.ascending.next_page_query,
            BY_TITLE_SORTED.descending.next_page_query,
            BY_DATE_ADDED_SORTED.ascending.next_page_query,
            BY_LAST_READ_SORTED.descending.next_page_query,
            BY_LAST_UPDATED_SORTED.ascending.next_page_query,
            BY_UNREAD_COUNT_SORTED.descending.next_page_query,
            BY_TIME_LEFT_SORTED.ascending.next_page_query,
        ]
        .map(|query| scratch.query_plan(query));

        for plan in plans {
            assert_eq!(
                plan.get(1).map(String::as_str),
                Some(IN_CATEGORY),
                "{plan:?}"
            );
            assert!(
                !plan.iter().any(|step| step.contains("series_by_stage")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn counts_the_category_s_series_from_its_index() {
        let scratch = ScratchLibrary::new("category-series-count-plan");

        let plan = scratch.query_plan(SERIES_IN_CATEGORY);

        assert!(plan.iter().any(|step| step == IN_CATEGORY), "{plan:?}");
    }
}
