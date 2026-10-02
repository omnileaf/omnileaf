use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::Transaction;

use crate::{Error, title_sort::title_sort_key};

#[derive(Clone, Debug)]
pub struct NewBook {
    pub id: BookId,
    pub series: SeriesId,
    pub title: String,
    pub added_at_ms: i64,
}

/// Fails with [`Error::UnknownSeries`] when the book's series isn't in the catalog yet.
#[tracing::instrument(skip_all, fields(book = %book.id, series = %book.series))]
pub fn add_book(transaction: &Transaction<'_>, book: &NewBook) -> Result<(), Error> {
    let added = transaction
        .prepare(
            "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
             SELECT ?1, local_id, ?3, ?4, ?5 FROM series WHERE id = ?2",
        )?
        .execute((
            book.id.as_bytes(),
            book.series.as_bytes(),
            &book.title,
            title_sort_key(&book.title),
            book.added_at_ms,
        ))?;
    if added == 0 {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}
