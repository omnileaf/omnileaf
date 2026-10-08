use rusqlite::{Connection, OptionalExtension};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        root::{LibraryRoot, RootId, stored_root},
    },
};

const IN_ADDED_ORDER: &str = "SELECT
        id, kind, locator_kind, location, bookmark, added_at_ms, unavailable_since_ms
    FROM library_root
    WHERE id > ?1
    ORDER BY id
    LIMIT ?2";
const ONE_ROOT: &str = "SELECT
        id, kind, locator_kind, location, bookmark, added_at_ms, unavailable_since_ms
    FROM library_root
    WHERE id = ?1";
const BOOKMARKED: &str = "SELECT
        id, kind, locator_kind, location, bookmark, added_at_ms, unavailable_since_ms
    FROM library_root
    WHERE kind = 'linked' AND locator_kind = 'apple_bookmark'
    ORDER BY id";

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

pub fn bookmarked_roots(connection: &Connection) -> Result<Vec<LibraryRoot>, Error> {
    let mut statement = connection.prepare(BOOKMARKED)?;
    let roots = statement
        .query_map([], stored_root)?
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
