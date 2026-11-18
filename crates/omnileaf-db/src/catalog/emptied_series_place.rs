use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, OptionalExtension, Row, Statement, Transaction};

use crate::{
    Error,
    catalog::{BookFile, RootId, native_path},
};

const PLACE_OF_SERIES: &str = "SELECT root_id, location FROM series_emptied_place
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = ?1)";
const LOCAL_SERIES_OF_BOOK: &str = "SELECT series_local_id FROM book WHERE id = ?1";
const LAST_PLACE_OF_BOOK: &str =
    "SELECT book.series_local_id, book_file.root_id, book_file.location
    FROM book JOIN book_file ON book_file.book_id = book.id
    WHERE book.id = ?1
    ORDER BY book_file.id DESC
    LIMIT 1";
const LOCAL_SERIES_OF_ANOTHER_BOOK_IN_FILE: &str = "SELECT book.series_local_id
    FROM book_file JOIN book ON book.id = book_file.book_id
    WHERE book_file.root_id = ?1 AND book_file.location = ?2 AND book_file.book_id != ?3";
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
const SERIES_OF_PLACE_COLUMN: usize = 0;
const ROOT_OF_PLACE_COLUMN: usize = 1;
const LOCATION_OF_PLACE_COLUMN: usize = 2;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmptiedPlace {
    pub root: RootId,
    pub folder: PathBuf,
}

pub(crate) struct RemovedFile<'a> {
    pub(crate) book: BookId,
    pub(crate) location: &'a Path,
}

pub(crate) struct HeldPlace {
    series: i64,
    root: RootId,
    folder: PathBuf,
}

pub(crate) struct FilingPlaces<'t> {
    last_place_of_book: Statement<'t>,
    local_series_of_another_book_in_file: Statement<'t>,
    remember: Statement<'t>,
}

impl<'t> FilingPlaces<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            last_place_of_book: transaction.prepare(LAST_PLACE_OF_BOOK)?,
            local_series_of_another_book_in_file: transaction
                .prepare(LOCAL_SERIES_OF_ANOTHER_BOOK_IN_FILE)?,
            remember: transaction.prepare(REMEMBER_PLACE)?,
        })
    }

    pub(crate) fn held_before_filing(
        &mut self,
        book: BookId,
        file: &BookFile,
    ) -> Result<Vec<HeldPlace>, Error> {
        let of_book = self
            .last_place_of_book
            .query_row([book.as_bytes()], held_place)
            .optional()?;
        let location = native_path::to_bytes(&file.location);
        let of_file = self
            .local_series_of_another_book_in_file
            .query_row((file.root.0, location, book.as_bytes()), |row| row.get(0))
            .optional()?
            .map(|series| HeldPlace {
                series,
                root: file.root,
                folder: folder_of(&file.location).to_path_buf(),
            });
        Ok(of_book.into_iter().chain(of_file).collect())
    }

    pub(crate) fn remember_emptied(&mut self, held: &[HeldPlace]) -> Result<(), Error> {
        for place in held {
            remember(&mut self.remember, place.series, place.root, &place.folder)?;
        }
        Ok(())
    }
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
        last_folder_of.insert(series, folder_of(file.location));
    }
    let mut remember_place = connection.prepare(REMEMBER_PLACE)?;
    for (series, folder) in last_folder_of {
        remember(&mut remember_place, series, root, folder)?;
    }
    Ok(())
}

fn remember(
    statement: &mut Statement<'_>,
    series: i64,
    root: RootId,
    folder: &Path,
) -> Result<(), Error> {
    statement.execute((series, root.0, native_path::to_bytes(folder)))?;
    Ok(())
}

fn folder_of(location: &Path) -> &Path {
    location.parent().unwrap_or_else(|| Path::new(""))
}

fn held_place(row: &Row<'_>) -> rusqlite::Result<HeldPlace> {
    let location = native_path::stored_native_path(row, LOCATION_OF_PLACE_COLUMN)?;
    Ok(HeldPlace {
        series: row.get(SERIES_OF_PLACE_COLUMN)?,
        root: RootId(row.get(ROOT_OF_PLACE_COLUMN)?),
        folder: folder_of(&location).to_path_buf(),
    })
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
    fn finds_the_last_place_of_a_book_through_its_files_by_book() {
        let scratch = ScratchLibrary::new("last-place-of-book-plan");

        let plan = scratch.query_plan(LAST_PLACE_OF_BOOK);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
            ]
        );
    }

    #[test]
    fn finds_the_series_of_another_book_in_a_file_by_its_root_and_location() {
        let scratch = ScratchLibrary::new("series-of-another-book-in-file-plan");

        let plan = scratch.query_plan(LOCAL_SERIES_OF_ANOTHER_BOOK_IN_FILE);

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INDEX sqlite_autoindex_book_file_1 (root_id=? AND location=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
            ]
        );
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
