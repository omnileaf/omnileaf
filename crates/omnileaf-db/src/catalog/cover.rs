use std::{fmt, path::PathBuf, str::FromStr};

use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{
        native_path,
        root::{RootLocator, stored_locator},
        stored_id::stored_id,
    },
};

const FILE_OF_COVER: &str =
    "SELECT library_root.locator_kind, library_root.location, library_root.bookmark,
        library_root.tree_name, library_root.tree_place, book_file.location
    FROM book_file JOIN library_root ON library_root.id = book_file.root_id
    WHERE book_file.id = ?1 AND book_file.book_id = ?2 AND book_file.rev = ?3";
const ROOT_LOCATOR_KIND_COLUMN: usize = 0;

/// Joins `series` to its cover's file as `cover`: the first file of its first book in title order that has one.
macro_rules! join_series_cover {
    () => {
        "LEFT JOIN book_file AS cover ON cover.id = (
            SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
            FROM book
            WHERE book.series_local_id = series.local_id
                AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
            ORDER BY book.title_sort_key, book.id
            LIMIT 1
        )"
    };
}

pub(crate) use join_series_cover;
const FILE_LOCATION_COLUMN: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BookFileId(pub(crate) i64);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Cover {
    pub book: BookId,
    pub file: BookFileId,
    pub rev: u32,
}

#[tracing::instrument(skip_all, fields(book = %cover.book, file = %cover.file, rev = cover.rev))]
pub fn cover_file(
    connection: &Connection,
    cover: &Cover,
) -> Result<Option<(RootLocator, PathBuf)>, Error> {
    Ok(connection
        .prepare(FILE_OF_COVER)?
        .query_row((cover.file.0, cover.book.as_bytes(), cover.rev), |row| {
            Ok((
                stored_locator(row, ROOT_LOCATOR_KIND_COLUMN)?,
                native_path::stored_native_path(row, FILE_LOCATION_COLUMN)?,
            ))
        })
        .optional()?)
}

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
