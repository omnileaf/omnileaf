use rusqlite::Connection;

use crate::Error;

const SERIES_WITH_BOOKS: &str = "SELECT count(*) FROM series WHERE book_count > 0";

/// Counts the series the library shows, which are those holding at least one book.
pub fn series_count(connection: &Connection) -> Result<u32, Error> {
    Ok(connection
        .prepare(SERIES_WITH_BOOKS)?
        .query_row([], |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_through_an_index_holding_only_the_listed_series() {
        let scratch = ScratchLibrary::new("series-count-plan");

        let plan = scratch.query_plan(SERIES_WITH_BOOKS);

        assert_eq!(plan, ["SCAN series USING INDEX series_by_added"]);
    }
}
