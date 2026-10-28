use omnileaf_sync_proto::BookId;
use rusqlite::Connection;

use crate::Error;

const BOOKMARKED_PAGES: &str = "SELECT page FROM book_bookmark WHERE book_id = ?1 ORDER BY page";

#[tracing::instrument(skip_all, fields(%book))]
pub fn book_bookmarks(connection: &Connection, book: BookId) -> Result<Vec<u32>, Error> {
    let mut statement = connection.prepare(BOOKMARKED_PAGES)?;
    let pages = statement
        .query_map([book.as_bytes()], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(pages)
}
