use std::{
    hash::{DefaultHasher, Hash, Hasher},
    path::Path,
    time::Duration,
};

use rusqlite::{Connection, OpenFlags, Row, types::ValueRef};

use crate::{Error, letter_case::add_fold_case};

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const CHECK_PASSED: &str = "ok";

#[derive(Debug, PartialEq, Eq)]
struct Fingerprint {
    schema_version: u32,
    application_id: i32,
    tables: Vec<TableContents>,
}

#[derive(Debug, PartialEq, Eq)]
struct TableContents {
    name: String,
    rows: u64,
    unordered_row_hash: u64,
}

#[tracing::instrument(skip_all, fields(original = %original.display(), copy = %copy.display()))]
pub fn copy_library(original: &Path, copy: &Path) -> Result<(), Error> {
    let copy_text = copy.to_str().ok_or_else(|| Error::CopyPathNotUnicode {
        path: copy.to_owned(),
    })?;
    let writer = opened(original, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    writer.execute_batch("BEGIN IMMEDIATE")?;
    let reader = opened(original, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    reader
        .execute("VACUUM INTO ?1", [copy_text])
        .map_err(|source| Error::Copy {
            path: copy.to_owned(),
            source,
        })?;
    let expected = fingerprint(&reader)?;
    if !holds(copy, &expected)? {
        return Err(Error::CopyDiffers {
            path: copy.to_owned(),
        });
    }
    writer.execute_batch("ROLLBACK")?;
    Ok(())
}

#[tracing::instrument(skip_all, fields(original = %original.display(), copy = %copy.display()))]
pub fn is_copy_of(copy: &Path, original: &Path) -> Result<bool, Error> {
    let expected = fingerprint(&opened(original, OpenFlags::SQLITE_OPEN_READ_ONLY)?)?;
    holds(copy, &expected)
}

fn holds(copy: &Path, expected: &Fingerprint) -> Result<bool, Error> {
    let copy = opened(copy, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let check: String = copy.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    Ok(check == CHECK_PASSED && fingerprint(&copy)? == *expected)
}

fn opened(path: &Path, flags: OpenFlags) -> Result<Connection, Error> {
    let connection = Connection::open_with_flags(path, flags).map_err(|source| Error::Open {
        path: path.to_owned(),
        source,
    })?;
    connection.busy_timeout(BUSY_TIMEOUT)?;
    add_fold_case(&connection)?;
    Ok(connection)
}

fn fingerprint(connection: &Connection) -> Result<Fingerprint, Error> {
    let (schema_version, application_id) = connection.query_row(
        "SELECT
             (SELECT user_version FROM pragma_user_version),
             (SELECT application_id FROM pragma_application_id)",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let tables: Vec<String> = connection
        .prepare(
            "SELECT name FROM sqlite_schema
             WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
             ORDER BY name",
        )?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let tables = tables
        .into_iter()
        .map(|name| contents_of(connection, name))
        .collect::<Result<_, _>>()?;
    Ok(Fingerprint {
        schema_version,
        application_id,
        tables,
    })
}

fn contents_of(connection: &Connection, name: String) -> Result<TableContents, Error> {
    let mut statement =
        connection.prepare(&format!("SELECT * FROM \"{}\"", name.replace('"', "\"\"")))?;
    let columns = statement.column_count();
    let mut rows = statement.query([])?;
    let mut contents = TableContents {
        name,
        rows: 0,
        unordered_row_hash: 0,
    };
    while let Some(row) = rows.next()? {
        contents.rows += 1;
        contents.unordered_row_hash = contents
            .unordered_row_hash
            .wrapping_add(hash_of(row, columns)?);
    }
    Ok(contents)
}

fn hash_of(row: &Row<'_>, columns: usize) -> rusqlite::Result<u64> {
    let mut hasher = DefaultHasher::new();
    for column in 0..columns {
        match row.get_ref(column)? {
            ValueRef::Null => 0_u8.hash(&mut hasher),
            ValueRef::Integer(value) => (1_u8, value).hash(&mut hasher),
            ValueRef::Real(value) => (2_u8, value.to_bits()).hash(&mut hasher),
            ValueRef::Text(bytes) => (3_u8, bytes).hash(&mut hasher),
            ValueRef::Blob(bytes) => (4_u8, bytes).hash(&mut hasher),
        }
    }
    Ok(hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Database, scratch::ScratchLibrary};

    const FINISHED_AT_MS: i64 = 1_790_000_000_000;
    const FINISHED_LATER_AT_MS: i64 = 1_790_000_000_001;

    fn library_finished_at(scratch: &ScratchLibrary, finished_at_ms: i64) {
        drop(Database::open(&scratch.config).unwrap());
        Connection::open(&scratch.config.path)
            .unwrap()
            .execute(
                "INSERT INTO first_launch (id, finished_at_ms) VALUES (1, ?1)",
                [finished_at_ms],
            )
            .unwrap();
    }

    #[test]
    fn copies_a_library_into_a_file_that_matches_it() {
        let original = ScratchLibrary::new("copy-original");
        let target = ScratchLibrary::new("copy-target");
        library_finished_at(&original, FINISHED_AT_MS);

        copy_library(&original.config.path, &target.config.path).unwrap();

        assert!(is_copy_of(&target.config.path, &original.config.path).unwrap());
    }

    #[test]
    fn tells_a_copy_from_another_library_holding_as_many_rows() {
        let original = ScratchLibrary::new("copy-alike-original");
        let other = ScratchLibrary::new("copy-alike-other");
        library_finished_at(&original, FINISHED_AT_MS);
        library_finished_at(&other, FINISHED_LATER_AT_MS);

        let is_copy = is_copy_of(&other.config.path, &original.config.path).unwrap();

        assert!(!is_copy);
    }
}
