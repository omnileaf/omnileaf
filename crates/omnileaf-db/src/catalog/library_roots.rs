use std::path::PathBuf;

use rusqlite::{Connection, OptionalExtension};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        native_path,
        page::{Page, PageRequest},
        root::{APPLE_BOOKMARK_LOCATOR, AppleBookmark, LibraryRoot, RootId, RootKind, stored_root},
    },
};

const IN_ADDED_ORDER: &str = "SELECT
        id, kind, locator_kind, location, bookmark, tree_name, tree_place, added_at_ms,
        unavailable_since_ms
    FROM library_root
    WHERE id > ?1
    ORDER BY id
    LIMIT ?2";
const ONE_ROOT: &str = "SELECT
        id, kind, locator_kind, location, bookmark, tree_name, tree_place, added_at_ms,
        unavailable_since_ms
    FROM library_root
    WHERE id = ?1";
const BOOKMARKED: &str = "SELECT id, location, bookmark, unavailable_since_ms
    FROM library_root
    WHERE kind = ?1 AND locator_kind = ?2
    ORDER BY id";

/// A linked folder that only its bookmark can open, as it was last opened.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookmarkedRoot {
    pub id: RootId,
    pub path: PathBuf,
    pub bookmark: AppleBookmark,
    pub unavailable_since_ms: Option<i64>,
}

/// Lists the home folder and the linked folders together, in the order they were added.
#[tracing::instrument(skip_all, fields(size = ?request.size))]
pub fn library_roots(
    connection: &Connection,
    request: &PageRequest,
) -> Result<Page<LibraryRoot>, Error> {
    let after = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => i64::MIN,
        Some(Position::Root { id }) => *id,
        Some(Position::Title { .. } | Position::Added { .. } | Position::Book { .. }) => {
            return Err(Error::CursorForAnotherList);
        }
    };
    let mut statement = connection.prepare(IN_ADDED_ORDER)?;
    let rows = statement
        .query_map((after, request.size.rows_to_fetch()), |row| {
            let root = stored_root(row)?;
            let position = Position::Root { id: root.id.0 };
            Ok((root, position))
        })?
        .collect::<Result<_, _>>()?;
    Ok(Page::of(rows, request.size))
}

pub fn bookmarked_roots(connection: &Connection) -> Result<Vec<BookmarkedRoot>, Error> {
    let mut statement = connection.prepare(BOOKMARKED)?;
    let roots = statement
        .query_map((RootKind::Linked, APPLE_BOOKMARK_LOCATOR), |row| {
            Ok(BookmarkedRoot {
                id: RootId(row.get(0)?),
                path: native_path::stored_native_path(row, 1)?,
                bookmark: AppleBookmark::new(row.get(2)?),
                unavailable_since_ms: row.get(3)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(roots)
}

/// Fails with [`Error::UnknownRoot`] when the library has no root with that id.
pub fn library_root(connection: &Connection, id: RootId) -> Result<LibraryRoot, Error> {
    connection
        .prepare(ONE_ROOT)?
        .query_row([id.0], stored_root)
        .optional()?
        .ok_or(Error::UnknownRoot { id })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn walks_the_roots_by_their_key_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("roots-plan");

        let plan = scratch.query_plan(IN_ADDED_ORDER);

        assert_eq!(
            plan,
            ["SEARCH library_root USING INTEGER PRIMARY KEY (rowid>?)"]
        );
    }
}
