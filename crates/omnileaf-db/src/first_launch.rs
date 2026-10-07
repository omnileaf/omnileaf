//! Whether this device has been through its first launch, which never syncs since each device sets up its own folders.

use rusqlite::{Connection, Transaction};

use crate::Error;

const THE_FIRST_LAUNCH: i64 = 1;

pub fn first_launch_finished(connection: &Connection) -> Result<bool, Error> {
    Ok(connection
        .prepare("SELECT EXISTS (SELECT 1 FROM first_launch)")?
        .query_row([], |row| row.get(0))?)
}

/// Keeps the time of the first finish, so finishing again changes nothing.
pub fn finish_first_launch(
    transaction: &Transaction<'_>,
    finished_at_ms: i64,
) -> Result<(), Error> {
    transaction
        .prepare(
            "INSERT INTO first_launch (id, finished_at_ms) VALUES (?1, ?2)
             ON CONFLICT (id) DO NOTHING",
        )?
        .execute((THE_FIRST_LAUNCH, finished_at_ms))?;
    Ok(())
}
