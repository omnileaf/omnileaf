use std::path::Path;

use omnileaf_sync_proto::SeriesId;
use rusqlite::{Statement, Transaction};

use crate::{
    Error,
    catalog::{NewSeries, RootId, native_path, series::SeriesAdder, stored_id::stored_id},
    title_key::TitleCollation,
};

const ADD_FOLDER: &str =
    "INSERT INTO series_folder (root_id, location, series_local_id, group_location)
     SELECT ?1, ?2, local_id, ?4 FROM series WHERE id = ?3
     ON CONFLICT DO NOTHING";
const SERIES_OF_FOLDER: &str = "SELECT series.id
     FROM series_folder JOIN series ON series.local_id = series_folder.series_local_id
     WHERE series_folder.root_id = ?1 AND series_folder.location = ?2";
const JOIN_FOLDER: &str = "UPDATE series_folder
     SET series_local_id = (SELECT local_id FROM series WHERE id = ?3)
     WHERE root_id = ?1 AND location = ?2";
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
            join: transaction.prepare(JOIN_FOLDER)?,
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
        ))?;
        let filed_in = self
            .series_of_folder
            .query_row((found.root.0, &location), |row| stored_id(row, "id"))?;
        let filed_in = match found.named_series {
            Some(named) if filed_in == own => {
                series.add_or_rename(named, collation)?;
                self.join
                    .execute((found.root.0, &location, named.id().as_bytes()))?;
                self.move_books
                    .execute((named.id().as_bytes(), own.as_bytes()))?;
                named.id()
            }
            Some(_) | None => filed_in,
        };
        if filed_in != own {
            series.offer_year_of(own, filed_in)?;
        }
        Ok(filed_in)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

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
