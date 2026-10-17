use rusqlite::{Connection, ToSql};

use crate::{
    Error,
    catalog::{
        RootId,
        cursor::Position,
        page::{Page, PageRequest},
        series_listing::{SeriesFilter, SeriesListing, SeriesOrder, StageParams},
        series_page::{
            Directions, SeriesSummary, added_place, date_added_rows, directions, last_read_place,
            last_read_rows,
        },
        staged_rows::{Read, TitlePlace, title_place, title_rows},
    },
};

/// The series with a book file in the library folder bound as `:root`.
macro_rules! series_in_folder {
    () => {
        "SELECT DISTINCT book.series_local_id FROM book_file
            JOIN book ON book.id = book_file.book_id
            WHERE book_file.root_id = :root"
    };
}

/// Gathers the folder's series once for all three stages, rather than once in each.
const BY_TITLE: Directions<TitlePlace> = directions! {
    with: concat!("WITH in_folder AS MATERIALIZED (", series_in_folder!(), ") "),
    condition: " AND series.local_id IN in_folder",
    key: "title_key",
    sort_position: title_place,
};

const BY_DATE_ADDED: Directions<Position> = directions! {
    with: concat!("WITH in_folder AS MATERIALIZED (", series_in_folder!(), ") "),
    condition: " AND series.local_id IN in_folder",
    key: "added_at_ms",
    sort_position: added_place,
};

const BY_LAST_READ: Directions<Position> = directions! {
    with: concat!("WITH in_folder AS MATERIALIZED (", series_in_folder!(), ") "),
    condition: " AND series.local_id IN in_folder",
    key: "last_read_at_ms",
    sort_position: last_read_place,
};

const SERIES_IN_FOLDER: &str = concat!(
    "SELECT count(*) FROM series
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND local_id IN (",
    series_in_folder!(),
    ")"
);

#[tracing::instrument(skip_all, fields(%root, ?listing, size = ?request.size))]
pub fn folder_series_page(
    connection: &Connection,
    root: RootId,
    listing: &SeriesListing,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let bound: [(&'static str, &dyn ToSql); 1] = [(":root", &root.0)];
    let read = Read {
        connection,
        filter: listing.filter,
        limit: request.size.rows_to_fetch(),
        bound: &bound,
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let direction = listing.sort.direction;
    let rows = match listing.sort.order {
        SeriesOrder::Title => title_rows(&read, BY_TITLE.toward(direction), after),
        SeriesOrder::DateAdded => date_added_rows(&read, BY_DATE_ADDED.toward(direction), after),
        SeriesOrder::LastRead => last_read_rows(&read, BY_LAST_READ.toward(direction), after),
    }?;
    Ok(Page::of(rows, request.size))
}

#[tracing::instrument(skip_all, fields(%root, ?filter))]
pub fn folder_series_count(
    connection: &Connection,
    root: RootId,
    filter: &SeriesFilter,
) -> Result<u32, Error> {
    let stages = StageParams::of(*filter);
    let mut params = stages.named().to_vec();
    params.push((":root", &root.0));
    Ok(connection
        .prepare(SERIES_IN_FOLDER)?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    const FILES_BY_ROOT: &str =
        "SEARCH book_file USING INDEX sqlite_autoindex_book_file_1 (root_id=?)";

    #[test]
    fn gathers_the_folder_s_series_once_by_its_root_and_reads_each_stage_in_order() {
        let scratch = ScratchLibrary::new("folder-series-plan");

        let plans = [
            BY_TITLE.ascending.first_page_query,
            BY_TITLE.descending.next_page_query,
            BY_DATE_ADDED.ascending.first_page_query,
            BY_DATE_ADDED.descending.next_page_query,
        ]
        .map(|query| scratch.query_plan(query));

        for plan in plans {
            let gathered = plan
                .iter()
                .filter(|step| *step == "MATERIALIZE in_folder")
                .count();
            assert_eq!(gathered, 1, "{plan:?}");
            assert!(plan.iter().any(|step| step == FILES_BY_ROOT), "{plan:?}");
            assert!(
                !plan.iter().any(|step| step.contains("ORDER BY")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn counts_the_folder_s_series_by_its_root() {
        let scratch = ScratchLibrary::new("folder-series-count-plan");

        let plan = scratch.query_plan(SERIES_IN_FOLDER);

        assert!(plan.iter().any(|step| step == FILES_BY_ROOT), "{plan:?}");
    }
}
