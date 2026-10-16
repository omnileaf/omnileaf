use rusqlite::Connection;

use crate::{
    Error,
    catalog::series_listing::{SeriesFilter, StageParams},
};

const SERIES_WITH_BOOKS: &str =
    "SELECT count(*) FROM series WHERE reading_stage IN (:unstarted, :in_progress, :finished)";

pub fn series_count(connection: &Connection, filter: &SeriesFilter) -> Result<u32, Error> {
    let params = StageParams::of(*filter);
    Ok(connection
        .prepare(SERIES_WITH_BOOKS)?
        .query_row(params.named().as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_only_the_stretches_of_an_index_holding_the_stages_the_filter_lets_through() {
        let scratch = ScratchLibrary::new("series-count-plan");

        let plan = scratch.query_plan(SERIES_WITH_BOOKS);

        assert_eq!(
            plan,
            ["SEARCH series USING INDEX series_by_stage_and_updated (reading_stage=?)"]
        );
    }
}
