#![expect(
    clippy::unwrap_used,
    reason = "seeding a library is test set-up, so a failure should stop the test"
)]

use omnileaf_db::{
    Database,
    catalog::{NewBook, NewSeries, add_book, add_series},
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};

const ADDED_LONG_AGO_MS: i64 = 1;
const ONE_BOOK: &[&str] = &["Volume 01"];

#[derive(Clone, Copy)]
pub(crate) struct SeriesSeed<'a> {
    pub(crate) name: &'a str,
    pub(crate) added_at_ms: i64,
    pub(crate) book_titles: &'a [&'a str],
}

impl<'a> SeriesSeed<'a> {
    /// A series added long ago holding one book, `Volume 01`.
    pub(crate) const fn named(name: &'a str) -> Self {
        Self {
            name,
            added_at_ms: ADDED_LONG_AGO_MS,
            book_titles: ONE_BOOK,
        }
    }
}

/// Adds every series and its books in one transaction.
pub(crate) async fn seed_library(database: &Database, series: &[SeriesSeed<'_>]) {
    let rows: Vec<(NewSeries, Vec<NewBook>)> = series.iter().map(new_series).collect();
    database
        .write(move |transaction| {
            for (series, books) in &rows {
                add_series(transaction, series)?;
                for book in books {
                    add_book(transaction, book)?;
                }
            }
            Ok(())
        })
        .await
        .unwrap();
}

/// A fingerprint that differs for every series and title, as a fingerprint of the book's pages would.
pub(crate) fn fingerprint(series: &str, title: &str) -> Fingerprint {
    let name = format!("{series}/{title}");
    let pages = name.bytes().zip(0..).map(|(byte, crc32)| ImageEntry {
        crc32,
        size: u64::from(byte),
    });
    Fingerprint::pmf1(pages).unwrap()
}

fn new_series(seed: &SeriesSeed<'_>) -> (NewSeries, Vec<NewBook>) {
    let series = NewSeries::local(seed.name, seed.added_at_ms).unwrap();
    let books = seed
        .book_titles
        .iter()
        .map(|&title| NewBook {
            fingerprint: fingerprint(seed.name, title),
            series: series.id(),
            title: title.to_owned(),
            added_at_ms: seed.added_at_ms,
        })
        .collect();
    (series, books)
}
