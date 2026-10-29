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
        "SELECT category_member.series_local_id FROM category_member
            WHERE category_member.category_id = :category"
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
    SELECT 1 FROM category_member WHERE category_id = :category LIMIT :few)";

macro_rules! members_of_category {
    () => {
        " FROM category_member CROSS JOIN series ON series.local_id = category_member.series_local_id
            WHERE category_member.category_id = :category
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
    Ok(connection.prepare_cached(CATEGORY_IS_FEW)?.query_row(
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
        .prepare_cached(SERIES_IN_CATEGORY)?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    const IN_CATEGORY: &str = "SEARCH category_member USING PRIMARY KEY (category_id=?)";

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

    mod category_members {
        use std::path::Path;

        use omnileaf_sync_proto::SeriesId;
        use proptest::{collection::vec, prelude::*};

        use super::*;
        use crate::{
            Database,
            migration::{self, MIGRATIONS},
            scratch::ScratchLibrary,
            store::projector::set_category_membership,
        };

        const SERIES: u8 = 3;
        const CATEGORIES: u8 = 2;
        const MIGRATION_BEFORE_CATEGORY_MEMBERS: usize = 64;

        #[derive(Clone, Debug)]
        enum Change {
            AddSeries(u8),
            DeleteSeries(u8),
            RekeySeries(u8, u8),
            AddMember(u8, u8),
            RemoveMember(u8, u8),
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

        fn apply(connection: &Connection, change: &Change) {
            match *change {
                Change::AddSeries(number) => {
                    connection
                        .execute(
                            "INSERT OR IGNORE INTO series
                                (id, source_id, natural_key, title, title_key, added_at_ms)
                            VALUES (?1, zeroblob(16), hex(?1), 'Series', x'', 0)",
                            [id(number)],
                        )
                        .unwrap();
                }
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
            }
        }

        fn pairs(connection: &Connection, sql: &str) -> Vec<(Vec<u8>, i64)> {
            connection
                .prepare(sql)
                .unwrap()
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        }

        proptest! {
            #[test]
            fn lists_each_member_series_of_a_category_by_local_id_after_any_changes(
                changes in vec(any_change(), 0..24)
            ) {
                let connection = migrated();

                for change in &changes {
                    apply(&connection, change);
                }

                prop_assert_eq!(
                    pairs(&connection, "SELECT category_id, series_local_id FROM category_member ORDER BY 1, 2"),
                    pairs(
                        &connection,
                        "SELECT series_category.category_id, series.local_id
                        FROM series_category JOIN series ON series.id = series_category.series_id
                        ORDER BY 1, 2"
                    )
                );
            }
        }

        #[test]
        fn lists_the_members_of_each_category_kept_from_before_the_upgrade() {
            let scratch = ScratchLibrary::new("category-member-upgrade");
            drop(
                Database::open_with(
                    &scratch.config,
                    &MIGRATIONS[..MIGRATION_BEFORE_CATEGORY_MEMBERS],
                )
                .unwrap(),
            );
            let connection = Connection::open(&scratch.config.path).unwrap();
            connection
                .execute(
                    "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                     VALUES (?1, zeroblob(16), 'a', 'A', x'', 0)",
                    [id(0)],
                )
                .unwrap();
            set_category_membership(&connection, series_id(0), category(0), true).unwrap();
            set_category_membership(&connection, series_id(1), category(0), true).unwrap();

            drop(Database::open(&scratch.config).unwrap());

            assert_eq!(
                pairs(
                    &connection,
                    "SELECT category_id, series_local_id FROM category_member"
                ),
                [(category(0).as_bytes().to_vec(), 1)]
            );
        }
    }
}
