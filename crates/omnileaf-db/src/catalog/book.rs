use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintKind, SeriesId, norm};
use rusqlite::Transaction;

use crate::{Error, title_sort::title_sort_key};

#[derive(Clone, Debug)]
pub struct NewBook {
    pub fingerprint: Fingerprint,
    pub series: SeriesId,
    pub title: String,
    pub added_at_ms: i64,
}

impl NewBook {
    #[must_use]
    pub fn id(&self) -> BookId {
        BookId::local(&self.fingerprint)
    }
}

/// Fails with [`Error::UnknownSeries`] when the book's series isn't in the catalog yet.
#[tracing::instrument(skip_all, fields(book = %book.id(), series = %book.series))]
pub fn add_book(transaction: &Transaction<'_>, book: &NewBook) -> Result<(), Error> {
    let added = transaction
        .prepare(
            "INSERT INTO book (
                 id, series_local_id, title, title_sort_key, added_at_ms,
                 content_fp, fp_kind, logical_key
             )
             SELECT ?1, local_id, ?3, ?4, ?5, ?6, ?7, ?8 FROM series WHERE id = ?2",
        )?
        .execute((
            book.id().as_bytes(),
            book.series.as_bytes(),
            &book.title,
            title_sort_key(&book.title),
            book.added_at_ms,
            book.fingerprint.as_bytes(),
            kind_name(book.fingerprint.kind()),
            norm(&book.title),
        ))?;
    if added == 0 {
        return Err(Error::UnknownSeries { id: book.series });
    }
    Ok(())
}

const fn kind_name(kind: FingerprintKind) -> &'static str {
    match kind {
        FingerprintKind::Pmf1 => "pmf1",
        FingerprintKind::Dir1 => "dir1",
        FingerprintKind::Raw1 => "raw1",
    }
}
