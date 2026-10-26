use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::{
    Error,
    migration::{self, MIGRATIONS, Pending},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LibraryContents {
    pub series: u64,
    pub books: u64,
}

#[tracing::instrument(skip_all, fields(path = %database.display()))]
pub fn library_contents(database: &Path) -> Result<LibraryContents, Error> {
    let connection = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|source| Error::Open {
            path: database.to_owned(),
            source,
        })?;
    match migration::pending(&connection, database, MIGRATIONS)? {
        Pending::NewDatabase => Err(Error::NotALibrary {
            path: database.to_owned(),
        }),
        Pending::Current | Pending::Upgrade { .. } => Ok(connection.query_row(
            "SELECT (SELECT count(*) FROM series), (SELECT count(*) FROM book)",
            [],
            |row| {
                Ok(LibraryContents {
                    series: row.get(0)?,
                    books: row.get(1)?,
                })
            },
        )?),
    }
}
