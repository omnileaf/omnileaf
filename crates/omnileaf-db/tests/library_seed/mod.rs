#![expect(
    clippy::unwrap_used,
    reason = "seeding a library is test set-up, so a failure should stop the test"
)]

use omnileaf_db::{
    Database,
    catalog::{NewBook, NewSeries, add_book, add_series},
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};

/// A series folder's name, when it was added, and the titles of its books.
pub(crate) type SeriesSeed<'a> = (&'a str, i64, &'a [&'a str]);

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

fn new_series(&(name, added_at_ms, titles): &SeriesSeed<'_>) -> (NewSeries, Vec<NewBook>) {
    let series = NewSeries::local(name, added_at_ms).unwrap();
    let books = titles
        .iter()
        .map(|&title| NewBook {
            fingerprint: fingerprint(name, title),
            series: series.id(),
            title: title.to_owned(),
            added_at_ms,
        })
        .collect();
    (series, books)
}
