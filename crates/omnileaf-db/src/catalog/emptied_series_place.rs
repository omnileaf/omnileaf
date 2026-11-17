use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{RootId, native_path},
};

const PLACE_OF_SERIES: &str = "SELECT root_id, location FROM series_emptied_place
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = ?1)";
const LOCAL_SERIES_OF_BOOK: &str = "SELECT series_local_id FROM book WHERE id = ?1";
const REMEMBER_PLACE: &str = "INSERT INTO series_emptied_place (series_local_id, root_id, location)
    SELECT ?1, ?2, ?3
    WHERE NOT EXISTS (
        SELECT 1 FROM book JOIN book_file ON book_file.book_id = book.id
        WHERE book.series_local_id = ?1
    )
    ON CONFLICT (series_local_id) DO UPDATE SET
        root_id = excluded.root_id,
        location = excluded.location";
const ROOT_COLUMN: usize = 0;
const LOCATION_COLUMN: usize = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmptiedPlace {
    pub root: RootId,
    pub folder: PathBuf,
}

pub(crate) struct RemovedFile<'a> {
    pub(crate) book: BookId,
    pub(crate) location: &'a Path,
}

#[tracing::instrument(skip_all, fields(%root, files = removed.len()))]
pub(crate) fn remember_emptied_places(
    connection: &Connection,
    root: RootId,
    removed: &[RemovedFile<'_>],
) -> Result<(), Error> {
    let mut local_series_of_book = connection.prepare(LOCAL_SERIES_OF_BOOK)?;
    let mut last_folder_of = BTreeMap::new();
    for file in removed {
        let series: i64 =
            local_series_of_book.query_row([file.book.as_bytes()], |row| row.get(0))?;
        let folder = file.location.parent().unwrap_or_else(|| Path::new(""));
        last_folder_of.insert(series, folder);
    }
    let mut remember = connection.prepare(REMEMBER_PLACE)?;
    for (series, folder) in last_folder_of {
        remember.execute((series, root.0, native_path::to_bytes(folder)))?;
    }
    Ok(())
}

#[tracing::instrument(skip_all, fields(%series))]
pub fn emptied_series_place(
    connection: &Connection,
    series: SeriesId,
) -> Result<Option<EmptiedPlace>, Error> {
    Ok(connection
        .prepare(PLACE_OF_SERIES)?
        .query_row([series.as_bytes()], stored_place)
        .optional()?)
}

fn stored_place(row: &Row<'_>) -> rusqlite::Result<EmptiedPlace> {
    Ok(EmptiedPlace {
        root: RootId(row.get(ROOT_COLUMN)?),
        folder: native_path::stored_native_path(row, LOCATION_COLUMN)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_series_of_a_removed_book_by_its_key() {
        let scratch = ScratchLibrary::new("series-of-removed-book-plan");

        let plan = scratch.query_plan(LOCAL_SERIES_OF_BOOK);

        assert_eq!(plan, ["SEARCH book USING PRIMARY KEY (id=?)"]);
    }

    #[test]
    fn looks_for_a_file_left_in_the_series_through_its_books() {
        let scratch = ScratchLibrary::new("remember-emptied-place-plan");

        let plan = scratch.query_plan(REMEMBER_PLACE);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
            ]
        );
    }

    #[test]
    fn finds_the_place_of_a_series_through_their_keys() {
        let scratch = ScratchLibrary::new("emptied-series-place-plan");

        let plan = scratch.query_plan(PLACE_OF_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH series_emptied_place USING INTEGER PRIMARY KEY (rowid=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }
}
