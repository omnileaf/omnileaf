use omnileaf_sync_proto::SeriesId;
use rusqlite::Connection;

use crate::{Error, catalog::stored_id::stored_id};

const EVERY_TITLE: &str = "SELECT id, title FROM series";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesTitle {
    pub id: SeriesId,
    pub title: String,
}

pub fn series_titles(connection: &Connection) -> Result<Vec<SeriesTitle>, Error> {
    Ok(connection
        .prepare(EVERY_TITLE)?
        .query_map([], |row| {
            Ok(SeriesTitle {
                id: stored_id(row, "id")?,
                title: row.get("title")?,
            })
        })?
        .collect::<Result<_, _>>()?)
}
