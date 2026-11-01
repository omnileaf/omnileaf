use std::path::Path;

use omnileaf_db::{
    Error,
    catalog::{
        LibraryRoot, RootId, RootLocator, home_root, keep_home_root_as_linked, root_book_count,
        set_home_root,
    },
    rusqlite::{Connection, Transaction},
};

use crate::library_folder::root_folder;

pub(crate) fn settle_home(
    transaction: &Transaction<'_>,
    home: &Path,
    added_at_ms: i64,
) -> Result<RootId, Error> {
    if let Some(chosen) = home_root(transaction)?.filter(|root| is_tree(&root.locator)) {
        return Ok(chosen.id);
    }
    move_home(
        transaction,
        &RootLocator::Path(home.to_path_buf()),
        added_at_ms,
    )
}

pub(crate) fn move_home(
    transaction: &Transaction<'_>,
    home: &RootLocator,
    added_at_ms: i64,
) -> Result<RootId, Error> {
    if let Some(old_home) = home_root(transaction)?
        && is_left_with_books(transaction, &old_home, home)?
    {
        keep_home_root_as_linked(transaction)?;
    }
    set_home_root(transaction, home, added_at_ms)
}

fn is_tree(locator: &RootLocator) -> bool {
    matches!(locator, RootLocator::AndroidTree(_))
}

/// An iOS app container moves to a new path along with its files, so only an old home still on disk is left with books.
fn is_left_with_books(
    connection: &Connection,
    old_home: &LibraryRoot,
    home: &RootLocator,
) -> Result<bool, Error> {
    Ok(is_elsewhere(&old_home.locator, home)
        && is_still_there(&old_home.locator)
        && root_book_count(connection, old_home.id)? > 0)
}

fn is_elsewhere(old_home: &RootLocator, home: &RootLocator) -> bool {
    match (old_home, home) {
        (RootLocator::AndroidTree(old), RootLocator::AndroidTree(new)) => old.uri() != new.uri(),
        (old, new) => root_folder(old) != root_folder(new),
    }
}

fn is_still_there(old_home: &RootLocator) -> bool {
    is_tree(old_home) || root_folder(old_home).is_dir()
}
