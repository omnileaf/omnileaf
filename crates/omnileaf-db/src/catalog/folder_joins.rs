use std::path::Path;

use omnileaf_sync_proto::SeriesId;
use rusqlite::{Statement, Transaction};

use crate::{
    Error,
    catalog::{NewSeries, RootId, native_path, series::SeriesAdder, stored_id::stored_id},
    title_key::TitleCollation,
};

const ADD_FOLDER: &str =
    "INSERT INTO series_folder (root_id, location, series_local_id, group_location, year)
     SELECT ?1, ?2, local_id, ?4, ?5 FROM series WHERE id = ?3
     ON CONFLICT DO NOTHING";
const SERIES_OF_FOLDER: &str = "SELECT series.id
     FROM series_folder JOIN series ON series.local_id = series_folder.series_local_id
     WHERE series_folder.root_id = ?1 AND series_folder.location = ?2";
const JOIN_FOLDERS: &str = "UPDATE series_folder SET series_local_id = joined.local_id
     FROM series AS joined, series AS left_behind
     WHERE joined.id = ?1 AND left_behind.id = ?2
         AND series_folder.series_local_id = left_behind.local_id";
const MOVE_SERIES_BOOKS: &str = "UPDATE book SET series_local_id = joined.local_id
     FROM series AS joined, series AS left_behind
     WHERE joined.id = ?1 AND left_behind.id = ?2 AND book.series_local_id = left_behind.local_id";

pub(crate) struct FolderJoins<'t> {
    add: Statement<'t>,
    series_of_folder: Statement<'t>,
    join: Statement<'t>,
    move_books: Statement<'t>,
}

pub(crate) struct FoundIn<'a> {
    pub(crate) root: RootId,
    pub(crate) series: &'a NewSeries,
    pub(crate) named_series: Option<&'a NewSeries>,
}

impl<'t> FolderJoins<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            add: transaction.prepare(ADD_FOLDER)?,
            series_of_folder: transaction.prepare(SERIES_OF_FOLDER)?,
            join: transaction.prepare(JOIN_FOLDERS)?,
            move_books: transaction.prepare(MOVE_SERIES_BOOKS)?,
        })
    }

    pub(crate) fn series_to_file_in(
        &mut self,
        found: &FoundIn<'_>,
        series: &mut SeriesAdder<'_>,
        collation: &TitleCollation,
    ) -> Result<SeriesId, Error> {
        let own = found.series.id();
        let Some(location) = found.series.location() else {
            return Ok(own);
        };
        let group = location.parent().unwrap_or_else(|| Path::new(""));
        let location = native_path::to_bytes(location);
        self.add.execute((
            found.root.0,
            &location,
            own.as_bytes(),
            native_path::to_bytes(group),
            found.series.year(),
        ))?;
        let filed_in = self
            .series_of_folder
            .query_row((found.root.0, &location), |row| stored_id(row, "id"))?;
        Ok(match found.named_series {
            Some(named) if filed_in == own => {
                series.add_or_rename(named, collation)?;
                self.join.execute((named.id().as_bytes(), own.as_bytes()))?;
                self.move_books
                    .execute((named.id().as_bytes(), own.as_bytes()))?;
                named.id()
            }
            Some(_) | None => filed_in,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn adds_a_folder_finding_its_series_by_id() {
        let scratch = ScratchLibrary::new("add-series-folder-plan");

        let plan = scratch.query_plan(ADD_FOLDER);

        assert_eq!(
            plan,
            ["SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)"]
        );
    }

    #[test]
    fn finds_the_series_of_a_folder_by_their_keys() {
        let scratch = ScratchLibrary::new("series-of-folder-plan");

        let plan = scratch.query_plan(SERIES_OF_FOLDER);

        assert_eq!(
            plan,
            [
                "SEARCH series_folder USING INDEX sqlite_autoindex_series_folder_1 (root_id=? AND location=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn joins_the_folders_of_a_series_through_their_series_index() {
        let scratch = ScratchLibrary::new("join-series-folders-plan");

        let plan = scratch.query_plan(JOIN_FOLDERS);

        assert_eq!(
            plan,
            [
                "SEARCH joined USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH left_behind USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH series_folder USING COVERING INDEX series_folder_by_series (series_local_id=?)",
            ]
        );
    }

    #[test]
    fn moves_the_books_of_a_series_through_its_book_index() {
        let scratch = ScratchLibrary::new("move-series-books-plan");

        let plan = scratch.query_plan(MOVE_SERIES_BOOKS);

        assert_eq!(
            plan,
            [
                "SEARCH joined USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH left_behind USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
            ]
        );
    }
}
