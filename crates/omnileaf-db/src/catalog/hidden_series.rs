use rusqlite::Connection;

use crate::{Error, catalog::RootId};

const EVERY_ONE_HIDDEN: &str = "SELECT count(*) FROM series
    WHERE is_out_of_reach AND book_count > 0";

const HIDDEN_BY_ROOT: &str = "SELECT count(*) FROM series
    WHERE is_out_of_reach AND book_count > 0 AND local_id IN (
        SELECT book.series_local_id FROM book_file
        JOIN book ON book.id = book_file.book_id
        WHERE book_file.root_id = ?1
    )";

/// The series hidden because every book of theirs is in a missing folder, all of them or those with a book in `root`.
pub fn hidden_series_count(connection: &Connection, root: Option<RootId>) -> Result<u32, Error> {
    Ok(match root {
        None => connection
            .prepare(EVERY_ONE_HIDDEN)?
            .query_row([], |row| row.get(0))?,
        Some(root) => connection
            .prepare(HIDDEN_BY_ROOT)?
            .query_row([root.0], |row| row.get(0))?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_every_hidden_series_from_its_own_index() {
        let scratch = ScratchLibrary::new("hidden-series-plan");

        let plan = scratch.query_plan(EVERY_ONE_HIDDEN);

        assert_eq!(plan, ["SCAN series USING INDEX series_out_of_reach"]);
    }
}
