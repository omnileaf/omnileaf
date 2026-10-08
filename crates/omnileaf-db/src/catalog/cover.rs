use std::{fmt, path::PathBuf, str::FromStr};

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{RootLocator, native_path, root::stored_locator, stored_id::stored_id},
};

const FILE_OF_COVER: &str =
    "SELECT library_root.locator_kind, library_root.location, book_file.location
    FROM book_file JOIN library_root ON library_root.id = book_file.root_id
    WHERE book_file.id = ?1 AND book_file.book_id = ?2 AND book_file.rev = ?3";
const ROOT_LOCATOR_KIND_COLUMN: usize = 0;
const FILE_LOCATION_COLUMN: usize = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BookFileId(pub(crate) i64);

/// The file a book's cover is read from, at the revision of it the cover shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Cover {
    pub book: BookId,
    pub file: BookFileId,
    pub rev: u32,
}

/// Where the cover's file is on disk, or nothing once that file has changed or gone since the cover was listed.
#[tracing::instrument(skip_all, fields(book = %cover.book, file = %cover.file, rev = cover.rev))]
pub fn cover_file(connection: &Connection, cover: &Cover) -> Result<Option<PathBuf>, Error> {
    Ok(connection
        .prepare(FILE_OF_COVER)?
        .query_row((cover.file.0, cover.book.as_bytes(), cover.rev), |row| {
            let RootLocator::Path(folder) = stored_locator(row, ROOT_LOCATOR_KIND_COLUMN)?;
            Ok(folder.join(native_path::stored_native_path(row, FILE_LOCATION_COLUMN)?))
        })
        .optional()?)
}

/// Reads the cover from a row's `cover_book`, `cover_file` and `cover_rev`, which a series without a book file leaves null.
pub(crate) fn stored_cover(row: &Row<'_>) -> rusqlite::Result<Option<Cover>> {
    let Some(file) = row.get::<_, Option<i64>>("cover_file")? else {
        return Ok(None);
    };
    Ok(Some(Cover {
        book: stored_id(row, "cover_book")?,
        file: BookFileId(file),
        rev: row.get("cover_rev")?,
    }))
}

impl fmt::Display for BookFileId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl FromStr for BookFileId {
    type Err = Error;

    fn from_str(text: &str) -> Result<Self, Error> {
        text.parse()
            .map(Self)
            .map_err(|_| Error::MalformedBookFileId)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_a_cover_s_file_and_its_folder_by_their_keys() {
        let scratch = ScratchLibrary::new("cover-file-plan");

        let plan = scratch.query_plan(FILE_OF_COVER);

        assert_eq!(
            plan,
            [
                "SEARCH book_file USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
