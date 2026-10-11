use std::path::Path;

use omnileaf_db::{
    Error,
    catalog::{
        LibraryRoot, RootLocator, home_root, keep_home_root_as_linked, root_book_count,
        set_home_root,
    },
    rusqlite::{Connection, Transaction},
};

pub(crate) fn move_home(
    transaction: &Transaction<'_>,
    home: &Path,
    added_at_ms: i64,
) -> Result<(), Error> {
    if let Some(old_home) = home_root(transaction)?
        && is_left_with_books(transaction, &old_home, home)?
    {
        keep_home_root_as_linked(transaction)?;
    }
    set_home_root(
        transaction,
        &RootLocator::Path(home.to_path_buf()),
        added_at_ms,
    )?;
    Ok(())
}

/// An iOS app container moves to a new path along with its files, so only an old home still on disk is left with books.
fn is_left_with_books(
    connection: &Connection,
    old_home: &LibraryRoot,
    home: &Path,
) -> Result<bool, Error> {
    let old_folder = old_home.locator.path();
    Ok(old_folder != home && old_folder.is_dir() && root_book_count(connection, old_home.id)? > 0)
}
