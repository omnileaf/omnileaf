use rusqlite::{Connection, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        gathering::sorted_directions,
        page::{Page, PageRequest},
        series_count::series_count,
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

macro_rules! kept_categories_of_series {
    () => {
        "(SELECT kept FROM series_kept_categories
            WHERE series_kept_categories.series_local_id = series.local_id)"
    };
}

macro_rules! in_no_category_candidates {
    () => {
        " FROM series_kept_categories INDEXED BY series_in_no_category
            CROSS JOIN series ON series.local_id = series_kept_categories.series_local_id
            WHERE series_kept_categories.kept = 0
                AND series.reading_stage IN (:unstarted, :in_progress, :finished)"
    };
}

const BY_TITLE: Directions<TitlePlace> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Directions<Position> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED: Directions<Position> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT: Directions<Position> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT: Directions<Position> = directions! {
    with: "",
    condition: concat!(" AND ", kept_categories_of_series!(), " = 0"),
    key: "time_left_key",
    sort_position: time_left_place,
};

const BY_TITLE_SORTED: Directions<TitlePlace> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED_SORTED: Directions<Position> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ_SORTED: Directions<Position> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED_SORTED: Directions<Position> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT_SORTED: Directions<Position> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT_SORTED: Directions<Position> = sorted_directions! {
    candidates: in_no_category_candidates!(),
    key: "time_left_key",
    sort_position: time_left_place,
};

const FEW_IN_NO_CATEGORY: i64 = 1_500;

const IN_NO_CATEGORY_ARE_FEW: &str = "SELECT count(*) < :few FROM (
    SELECT 1 FROM series_kept_categories INDEXED BY series_in_no_category WHERE kept = 0 LIMIT :few)";

const FEW_SERIES_IN_NO_CATEGORY: &str = concat!(
    "SELECT count(*)",
    in_no_category_candidates!(),
    counted_conditions!()
);

const SERIES_IN_A_CATEGORY: &str = concat!(
    "SELECT count(*) FROM series_kept_categories INDEXED BY series_in_a_category
        CROSS JOIN series ON series.local_id = series_kept_categories.series_local_id
        WHERE series_kept_categories.kept > 0
            AND series.reading_stage IN (:unstarted, :in_progress, :finished)",
    counted_conditions!()
);

const SHARE_IN_NO_CATEGORY: &str =
    "SELECT count(*) FILTER (WHERE kept = 0), count(*) FROM series_kept_categories";

fn listing_toward<'a, P>(
    few: bool,
    (in_stages, sorted): (&'a Directions<P>, &'a Directions<P>),
    direction: SortDirection,
) -> &'a Listing<P> {
    if few { sorted } else { in_stages }.toward(direction)
}

fn in_no_category_are_few(connection: &Connection) -> Result<bool, Error> {
    Ok(connection
        .prepare_cached(IN_NO_CATEGORY_ARE_FEW)?
        .query_row(named_params! { ":few": FEW_IN_NO_CATEGORY }, |row| {
            row.get(0)
        })?)
}

#[tracing::instrument(skip_all, fields(?listing, size = ?request.size))]
pub fn categoryless_series_page(
    connection: &Connection,
    listing: &SeriesListing,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let read = Read {
        connection,
        filter: &listing.filter,
        limit: request.size.rows_to_fetch(),
        bound: &[],
    };
    let few = in_no_category_are_few(connection)?;
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
pub fn categoryless_series_count(
    connection: &Connection,
    filter: &SeriesFilter,
) -> Result<u32, Error> {
    let (in_none, every): (u32, u32) = connection
        .prepare_cached(SHARE_IN_NO_CATEGORY)?
        .query_row([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    if in_none <= every - in_none {
        return counted(connection, FEW_SERIES_IN_NO_CATEGORY, filter);
    }
    let in_a_category = counted(connection, SERIES_IN_A_CATEGORY, filter)?;
    Ok(series_count(connection, filter)?.saturating_sub(in_a_category))
}

fn counted(connection: &Connection, query: &str, filter: &SeriesFilter) -> Result<u32, Error> {
    let filter = FilterParams::of(filter);
    Ok(connection
        .prepare_cached(query)?
        .query_row(filter.named().as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use omnileaf_sync_proto::{CategoryId, SeriesId};
    use proptest::{collection::vec, prelude::*};

    use super::*;
    use crate::{
        Database,
        migration::{self, MIGRATIONS},
        scratch::ScratchLibrary,
        store::projector::{set_category_kept, set_category_membership},
    };

    const SERIES: u8 = 3;
    const CATEGORIES: u8 = 2;
    const MIGRATION_BEFORE_KEPT_CATEGORIES: usize = 73;
    const SORTED_LISTINGS: [&str; 8] = [
        BY_TITLE_SORTED.ascending.first_page_query,
        BY_TITLE_SORTED.ascending.next_page_query,
        BY_TITLE_SORTED.descending.next_page_query,
        BY_DATE_ADDED_SORTED.ascending.next_page_query,
        BY_LAST_READ_SORTED.descending.next_page_query,
        BY_LAST_UPDATED_SORTED.ascending.next_page_query,
        BY_UNREAD_COUNT_SORTED.descending.next_page_query,
        BY_TIME_LEFT_SORTED.ascending.next_page_query,
    ];

    #[test]
    fn reads_each_stage_in_order_without_sorting() {
        let scratch = ScratchLibrary::new("categoryless-series-plan");

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
            assert!(
                !plan.iter().any(|step| step.contains("ORDER BY")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn finds_a_few_series_in_no_category_from_their_own_index() {
        let scratch = ScratchLibrary::new("categoryless-series-sorted-plan");

        let plans = SORTED_LISTINGS
            .into_iter()
            .chain([IN_NO_CATEGORY_ARE_FEW, FEW_SERIES_IN_NO_CATEGORY])
            .map(|query| scratch.query_plan(query));

        for plan in plans {
            assert!(
                plan.iter()
                    .any(|step| step.contains("INDEX series_in_no_category")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn counts_the_categorised_series_from_their_own_index() {
        let scratch = ScratchLibrary::new("categorised-series-count-plan");

        let plan = scratch.query_plan(SERIES_IN_A_CATEGORY);

        assert!(
            plan.iter()
                .any(|step| step.contains("INDEX series_in_a_category")),
            "{plan:?}"
        );
    }

    #[derive(Clone, Debug)]
    enum Change {
        AddSeries(u8),
        DeleteSeries(u8),
        RekeySeries(u8, u8),
        AddMember(u8, u8),
        RemoveMember(u8, u8),
        AddCategory(u8),
        DeleteCategory(u8),
    }

    fn any_change() -> impl Strategy<Value = Change> {
        prop_oneof![
            (0..SERIES).prop_map(Change::AddSeries),
            (0..SERIES).prop_map(Change::DeleteSeries),
            (0..SERIES, 0..SERIES).prop_map(|(from, to)| Change::RekeySeries(from, to)),
            (0..SERIES, 0..CATEGORIES)
                .prop_map(|(series, category)| Change::AddMember(series, category)),
            (0..SERIES, 0..CATEGORIES)
                .prop_map(|(series, category)| Change::RemoveMember(series, category)),
            (0..CATEGORIES).prop_map(Change::AddCategory),
            (0..CATEGORIES).prop_map(Change::DeleteCategory),
        ]
    }

    fn id(number: u8) -> [u8; 16] {
        *series_id(number).as_bytes()
    }

    fn series_id(number: u8) -> SeriesId {
        SeriesId::local(&format!("series {number}")).unwrap()
    }

    fn category(number: u8) -> CategoryId {
        CategoryId::from_name(&format!("category {number}")).unwrap()
    }

    fn migrated() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migration::apply(&mut connection, Path::new(":memory:"), MIGRATIONS).unwrap();
        connection
    }

    fn add_series(connection: &Connection, number: u8) {
        connection
            .execute(
                "INSERT OR IGNORE INTO series
                    (id, source_id, natural_key, title, title_key, added_at_ms)
                VALUES (?1, zeroblob(16), hex(?1), 'Series', x'', 0)",
                [id(number)],
            )
            .unwrap();
    }

    fn apply(connection: &Connection, change: &Change) {
        match *change {
            Change::AddSeries(number) => add_series(connection, number),
            Change::DeleteSeries(number) => {
                connection
                    .execute("DELETE FROM series WHERE id = ?1", [id(number)])
                    .unwrap();
            }
            Change::RekeySeries(from, to) => {
                connection
                    .execute(
                        "UPDATE OR IGNORE series SET id = ?2, natural_key = hex(?2) WHERE id = ?1",
                        (id(from), id(to)),
                    )
                    .unwrap();
            }
            Change::AddMember(series, number) => {
                set_category_membership(connection, series_id(series), category(number), true)
                    .unwrap();
            }
            Change::RemoveMember(series, number) => {
                set_category_membership(connection, series_id(series), category(number), false)
                    .unwrap();
            }
            Change::AddCategory(number) => {
                set_category_kept(connection, category(number), true).unwrap();
            }
            Change::DeleteCategory(number) => {
                set_category_kept(connection, category(number), false).unwrap();
            }
        }
    }

    fn kept_and_recounted(connection: &Connection) -> Vec<(Option<i64>, Option<i64>)> {
        connection
            .prepare(
                "SELECT (
                    SELECT kept FROM series_kept_categories
                    WHERE series_kept_categories.series_local_id = series.local_id
                ), (
                    SELECT count(*) FROM series_category
                    JOIN category ON category.category_id = series_category.category_id
                    WHERE series_category.series_id = series.id
                ) FROM series
                UNION ALL
                SELECT kept, NULL FROM series_kept_categories
                WHERE series_local_id NOT IN (SELECT local_id FROM series)",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    proptest! {
        #[test]
        fn keeps_the_count_of_each_series_categories_after_any_changes(
            changes in vec(any_change(), 0..24)
        ) {
            let connection = migrated();

            for change in &changes {
                apply(&connection, change);
            }

            for (kept, recounted) in kept_and_recounted(&connection) {
                prop_assert_eq!(kept, recounted);
            }
        }
    }

    #[test]
    fn counts_the_categories_each_series_was_in_before_the_upgrade() {
        let scratch = ScratchLibrary::new("kept-categories-upgrade");
        drop(
            Database::open_with(
                &scratch.config,
                &MIGRATIONS[..MIGRATION_BEFORE_KEPT_CATEGORIES],
            )
            .unwrap(),
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        for number in 0..SERIES {
            add_series(&connection, number);
        }
        set_category_kept(&connection, category(0), true).unwrap();
        set_category_membership(&connection, series_id(0), category(0), true).unwrap();
        set_category_membership(&connection, series_id(1), category(1), true).unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let kept: Vec<i64> = connection
            .prepare("SELECT kept FROM series_kept_categories ORDER BY series_local_id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(kept, [1, 0, 0]);
    }
}
