use std::path::Path;

use omnileaf_db::{
    Error,
    catalog::{
        LibraryRoot, RootLocator, home_root, keep_home_root_as_linked, root_book_count,
        set_home_root,
    },
    rusqlite::{Connection, Transaction},
};

/// Points the home root at `home`, keeping a home left behind that still holds books as a linked folder rather than dropping them.
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

/// A home whose folder is gone moved with its files, as an app container does, so only one still there is left behind.
fn is_left_with_books(
    connection: &Connection,
    old_home: &LibraryRoot,
    home: &Path,
) -> Result<bool, Error> {
    let old_folder = old_home.locator.path();
    Ok(old_folder != home && old_folder.is_dir() && root_book_count(connection, old_home.id)? > 0)
}
