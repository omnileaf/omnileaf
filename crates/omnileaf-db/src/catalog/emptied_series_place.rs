use std::path::PathBuf;

use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{RootId, native_path},
};

const PLACE_OF_SERIES: &str = "SELECT root_id, location FROM series_emptied_place
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = ?1)";
const ROOT_COLUMN: usize = 0;
const LOCATION_COLUMN: usize = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmptiedPlace {
    pub root: RootId,
    pub folder: PathBuf,
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
