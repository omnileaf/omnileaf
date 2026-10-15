mod support;

use std::{path::PathBuf, time::Instant};

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, NewRoot, NewSeries, RootKind, RootLocator, ScannedBook, add_root,
        record_scanned_books, remove_root,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const BOOKS: u32 = 5_000;
const BOOKS_PER_WRITE: usize = 250;
const ADDED_AT_MS: i64 = 1_780_000_000_000;
const BUDGET_MS: u128 = 3_000;

#[tokio::test]
#[ignore = "a timing test, run in release on its own"]
async fn records_and_removes_a_series_of_5_000_books_within_3_s() {
    let folder = ScratchFolder::new("long-series-scan-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from("/media/Long")),
        added_at_ms: ADDED_AT_MS,
    };
    let root = database
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap();
    let books: Vec<ScannedBook> = (1..=BOOKS)
        .map(|number| ScannedBook {
            series: NewSeries::local("Long Series", ADDED_AT_MS).unwrap(),
            fingerprint: Fingerprint::pmf1([ImageEntry {
                crc32: number,
                size: 1,
            }])
            .unwrap(),
            title: format!("Chapter {number}"),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root,
                location: format!("Long/Chapter {number}.cbz").into(),
                size_bytes: 100,
                modified_at_ms: ADDED_AT_MS,
            },
        })
        .collect();
    let started = Instant::now();

    for chunk in books.chunks(BOOKS_PER_WRITE) {
        let chunk = chunk.to_vec();
        database
            .write(move |transaction| record_scanned_books(transaction, &chunk))
            .await
            .unwrap();
    }
    database
        .write(move |transaction| remove_root(transaction, root))
        .await
        .unwrap();

    let took = started.elapsed().as_millis();
    assert!(took < BUDGET_MS, "took {took} ms");
}
