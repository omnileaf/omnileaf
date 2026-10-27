use rusqlite::{Connection, Transaction};

use crate::Error;

const HIDDEN_TYPES: &str = "SELECT file_type FROM hidden_file_type ORDER BY file_type";
const HIDE_TYPE: &str =
    "INSERT INTO hidden_file_type (file_type) VALUES (?1) ON CONFLICT (file_type) DO NOTHING";
const SHOW_TYPE: &str = "DELETE FROM hidden_file_type WHERE file_type = ?1";

pub fn hidden_file_types(connection: &Connection) -> Result<Vec<String>, Error> {
    Ok(connection
        .prepare(HIDDEN_TYPES)?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}

pub fn hide_file_type(transaction: &Transaction<'_>, file_type: &str) -> Result<(), Error> {
    transaction.prepare(HIDE_TYPE)?.execute([file_type])?;
    Ok(())
}

pub fn show_file_type(transaction: &Transaction<'_>, file_type: &str) -> Result<(), Error> {
    transaction.prepare(SHOW_TYPE)?.execute([file_type])?;
    Ok(())
}
