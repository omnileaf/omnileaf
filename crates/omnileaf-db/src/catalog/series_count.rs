use rusqlite::Connection;

use crate::{
    Error,
    catalog::series_listing::{FilterParams, SeriesFilter, meets_the_filter},
};

const SERIES_WITH_BOOKS: &str = concat!(
    "SELECT count(*) FROM series WHERE book_count > 0 AND ",
    meets_the_filter!()
);

/// Counts the series the library lists through `filter`, which are those holding at least one book that it lets through.
pub fn series_count(connection: &Connection, filter: &SeriesFilter) -> Result<u32, Error> {
    let params = FilterParams::of(*filter);
    Ok(connection
        .prepare(SERIES_WITH_BOOKS)?
        .query_row(params.named().as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_through_an_index_holding_only_the_listed_series_and_their_reading_counts() {
        let scratch = ScratchLibrary::new("series-count-plan");

        let plan = scratch.query_plan(SERIES_WITH_BOOKS);

        assert_eq!(plan, ["SCAN series USING COVERING INDEX series_by_added"]);
    }
}
