#![expect(
    clippy::unwrap_used,
    reason = "the library is a generated fixture, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "this test needs scratch folders but none of the files support can put in them"
)]
mod support;

use std::{
    fs,
    time::{Duration, Instant},
};

use omnileaf_engine::{Clock, Library, Resource, ResourceRouter};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_jpeg, scan_jpeg};
use support::TempFolder;

const BOOKS: u64 = 20;
const PAGES_AFTER_THE_COVER: u32 = 3;
const FOLDER: &str = "Scanned Library";
const BUDGET: Duration = Duration::from_millis(30);
const NOW_UNIX_MS: u64 = 1_790_000_000_000;

struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
}

/// One book in each series, so every book's cover is listed, each opening on a full-size scan.
fn write_scanned_library(root: &std::path::Path) {
    for book in 0..BOOKS {
        let series = format!("Sample Series {book:02}");
        let mut entries = vec![ArchiveEntry {
            name: "000.jpg".to_owned(),
            bytes: scan_jpeg(book).unwrap(),
        }];
        entries.extend((1..=PAGES_AFTER_THE_COVER).map(|index| ArchiveEntry {
            name: format!("{index:03}.jpg"),
            bytes: page_jpeg(book, index, PageShape::Portrait).unwrap(),
        }));
        let folder = root.join(&series);
        fs::create_dir_all(&folder).unwrap();
        fs::write(
            folder.join(format!("{series} v01.cbz")),
            cbz(&entries, Compression::Stored).unwrap(),
        )
        .unwrap();
    }
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn makes_a_cold_cover_thumbnail_from_a_full_size_scan_within_30_ms_at_p95() {
    let comics = TempFolder::new("cover-speed-comics");
    write_scanned_library(&comics.path().join(FOLDER));
    let home = TempFolder::new("cover-speed-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(FOLDER), |_| {})
        .await
        .unwrap();
    let cache = TempFolder::new("cover-speed-cache");
    let router = ResourceRouter::open(cache.path().to_path_buf())
        .await
        .unwrap();
    let covers: Vec<String> = library
        .series(None)
        .await
        .unwrap()
        .series
        .into_iter()
        .map(|series| format!("/{}", series.cover.unwrap()))
        .collect();

    let mut times = Vec::with_capacity(covers.len());
    for cover in &covers {
        let started = Instant::now();
        let resource = router.respond(&library, cover).await;
        times.push(started.elapsed());
        assert!(matches!(resource, Resource::Immutable { .. }));
    }

    times.sort();
    let median = times[times.len() / 2];
    let p95 = times[times.len() * 95 / 100 - 1];
    let slowest = times[times.len() - 1];
    eprintln!(
        "cold cover thumbnail from a 1800x2700 scan: median {median:?}, p95 {p95:?}, slowest {slowest:?} over {} covers, budget {BUDGET:?}",
        times.len()
    );
    assert_eq!(times.len(), usize::try_from(BOOKS).unwrap());
    assert!(
        p95 <= BUDGET,
        "a cold cover thumbnail took {p95:?} at p95, over the {BUDGET:?} budget"
    );
}
