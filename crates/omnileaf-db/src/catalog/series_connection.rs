use rusqlite::Connection;

use crate::{Error, catalog::series_page::SeriesSummary};

const SOME_FOLDER_IS_MISSING: &str =
    "SELECT EXISTS (SELECT 1 FROM library_root WHERE unavailable_since_ms IS NOT NULL)";

const IS_NOT_CONNECTED: &str = "SELECT
    NOT EXISTS (
        SELECT 1 FROM series
        JOIN book ON book.series_local_id = series.local_id
        JOIN book_file ON book_file.book_id = book.id
        JOIN library_root ON library_root.id = book_file.root_id
        WHERE series.id = ?1 AND library_root.unavailable_since_ms IS NULL
    ) AND EXISTS (
        SELECT 1 FROM series
        JOIN book ON book.series_local_id = series.local_id
        JOIN book_file ON book_file.book_id = book.id
        JOIN library_root ON library_root.id = book_file.root_id
        WHERE series.id = ?1 AND library_root.unavailable_since_ms IS NOT NULL
    )";

/// Marks the listed series whose every book file sits in a missing folder, which only a folder shown anyway lets into a listing.
pub(crate) fn note_connections<'a>(
    connection: &Connection,
    series: impl Iterator<Item = &'a mut SeriesSummary>,
) -> Result<(), Error> {
    let is_some_folder_missing: bool = connection
        .prepare_cached(SOME_FOLDER_IS_MISSING)?
        .query_row([], |row| row.get(0))?;
    if !is_some_folder_missing {
        return Ok(());
    }
    let mut statement = connection.prepare_cached(IS_NOT_CONNECTED)?;
    for summary in series {
        let is_not_connected: bool =
            statement.query_row([summary.id.as_bytes()], |row| row.get(0))?;
        summary.is_connected = !is_not_connected;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn looks_for_a_missing_folder_in_the_few_folders_there_are() {
        let scratch = ScratchLibrary::new("connection-missing-plan");

        let plan = scratch.query_plan(SOME_FOLDER_IS_MISSING);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SCAN library_root"
            ]
        );
    }

    #[test]
    fn walks_one_series_to_its_files_through_indexes() {
        let scratch = ScratchLibrary::new("connection-series-plan");

        let plan = scratch.query_plan(IS_NOT_CONNECTED);

        let walk = [
            "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
            "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
            "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
        ];
        let expected: Vec<&str> = ["SCAN CONSTANT ROW", "SCALAR SUBQUERY 1"]
            .into_iter()
            .chain(walk)
            .chain(["SCALAR SUBQUERY 2"])
            .chain(walk)
            .collect();
        assert_eq!(plan, expected);
    }
}
