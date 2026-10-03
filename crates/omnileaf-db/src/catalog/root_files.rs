use std::path::PathBuf;

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension, Row, Transaction, types::Type};

use crate::{
    Error,
    catalog::{RootId, native_path, stored_id::stored_id},
};

const FILES_IN_ROOT: &str = "SELECT book_id, location, size_bytes, modified_at_ms
    FROM book_file
    WHERE root_id = ?1";
const REMOVE_FILE: &str = "DELETE FROM book_file
    WHERE root_id = ?1 AND location = ?2
    RETURNING book_id";
const LOCATION_COLUMN: usize = 1;

/// A book file as the catalog last recorded it, for a rescan to tell what changed on disk since.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredFile {
    pub book: BookId,
    /// Relative to the root.
    pub location: PathBuf,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
}

/// Every file the catalog holds for the root, in no particular order.
#[tracing::instrument(skip_all, fields(%root))]
pub fn root_files(connection: &Connection, root: RootId) -> Result<Vec<StoredFile>, Error> {
    Ok(connection
        .prepare(FILES_IN_ROOT)?
        .query_map([root.0], stored_file)?
        .collect::<Result<_, _>>()?)
}

/// Deletes the root's files at `locations` and returns the books they held, once for each file deleted.
#[tracing::instrument(skip_all, fields(%root, files = locations.len()))]
pub fn remove_book_files(
    transaction: &Transaction<'_>,
    root: RootId,
    locations: &[PathBuf],
) -> Result<Vec<BookId>, Error> {
    let mut remove = transaction.prepare(REMOVE_FILE)?;
    let mut held = Vec::with_capacity(locations.len());
    for location in locations {
        let removed: Option<BookId> = remove
            .query_row((root.0, native_path::to_bytes(location)), |row| {
                stored_id(row, "book_id")
            })
            .optional()?;
        held.extend(removed);
    }
    Ok(held)
}

fn stored_file(row: &Row<'_>) -> rusqlite::Result<StoredFile> {
    let location = native_path::from_bytes(row.get(LOCATION_COLUMN)?).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(LOCATION_COLUMN, "location".to_owned(), Type::Blob)
    })?;
    Ok(StoredFile {
        book: stored_id(row, "book_id")?,
        location,
        size_bytes: row.get("size_bytes")?,
        modified_at_ms: row.get("modified_at_ms")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn lists_a_root_s_files_through_its_location_index() {
        let scratch = ScratchLibrary::new("root-files-plan");

        let plan = scratch.query_plan(FILES_IN_ROOT);

        assert_eq!(
            plan,
            ["SEARCH book_file USING INDEX sqlite_autoindex_book_file_1 (root_id=?)"]
        );
    }

    #[test]
    fn finds_a_file_to_remove_by_its_root_and_location() {
        let scratch = ScratchLibrary::new("remove-root-file-plan");

        let plan = scratch.query_plan(REMOVE_FILE);

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INDEX sqlite_autoindex_book_file_1 (root_id=? AND location=?)"
            ]
        );
    }
}
