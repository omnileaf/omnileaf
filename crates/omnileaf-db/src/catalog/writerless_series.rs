use rusqlite::Connection;

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        series_listing::{
            FilterParams, SeriesFilter, SeriesListing, SeriesOrder, counted_conditions,
        },
        series_page::{
            Directions, SeriesSummary, added_place, date_added_rows, directions, last_read_place,
            last_read_rows, last_updated_place, last_updated_rows, time_left_place, time_left_rows,
            unread_count_place, unread_count_rows,
        },
        staged_rows::{Read, TitlePlace, title_place, title_rows},
    },
};

macro_rules! series_naming_a_writer {
    () => {
        "SELECT series_local_id FROM series_person WHERE role = 'writer'"
    };
}

const BY_TITLE: Directions<TitlePlace> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Directions<Position> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const BY_LAST_UPDATED: Directions<Position> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "updated_at_ms",
    sort_position: last_updated_place,
};

const BY_UNREAD_COUNT: Directions<Position> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "unread_count",
    sort_position: unread_count_place,
};

const BY_TIME_LEFT: Directions<Position> = directions! {
    with: concat!("WITH written AS MATERIALIZED (", series_naming_a_writer!(), ") "),
    condition: " AND series.local_id NOT IN written",
    key: "time_left_key",
    sort_position: time_left_place,
};

const SERIES_NAMING_NO_WRITER: &str = concat!(
    "SELECT count(*) FROM series
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND local_id NOT IN (",
    series_naming_a_writer!(),
    ")",
    counted_conditions!()
);

#[tracing::instrument(skip_all, fields(?listing, size = ?request.size))]
pub fn writerless_series_page(
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
        SeriesOrder::TimeLeft => time_left_rows(&read, BY_TIME_LEFT.toward(direction), after),
    }?;
    Ok(Page::of(rows, request.size))
}

#[tracing::instrument(skip_all, fields(?filter))]
pub fn writerless_series_count(
    connection: &Connection,
    filter: &SeriesFilter,
) -> Result<u32, Error> {
    let filter = FilterParams::of(filter);
    Ok(connection
        .prepare(SERIES_NAMING_NO_WRITER)?
        .query_row(filter.named().as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn gathers_the_written_series_once_and_reads_each_stage_in_order() {
        let scratch = ScratchLibrary::new("writerless-series-plan");

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
                .filter(|step| *step == "MATERIALIZE written")
                .count();
            assert_eq!(gathered, 1, "{plan:?}");
            assert!(
                !plan.iter().any(|step| step.contains("ORDER BY")),
                "{plan:?}"
            );
        }
    }
}
