#![expect(
    clippy::unwrap_used,
    reason = "the library is a generated fixture, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "this test needs scratch folders but none of the files support can put in them"
)]
mod support;

use std::{fs, num::NonZeroUsize, slice::Iter, time::Duration};

use omnileaf_engine::{Library, Resource, ResourceRouter};
use omnileaf_testkit::{
    ArchiveEntry, Compression, PageShape, Sampling, SpeedTrial, Statistic, TimingBudget, cbz,
    page_jpeg, subsampled_scan_jpeg,
};
use support::{FixedClock, TempFolder};

const BOOKS: u64 = 100;
const PAGES_AFTER_THE_COVER: u32 = 3;
const FOLDER: &str = "Scanned Library";
const BUDGET: Duration = Duration::from_millis(30);

/// One book in each series, so every book's cover is listed, each opening on a typical full-size colour scan.
fn write_scanned_library(root: &std::path::Path) {
    for book in 0..BOOKS {
        let series = format!("Sample Series {book:02}");
        let mut entries = vec![ArchiveEntry {
            name: "000.jpg".to_owned(),
            bytes: subsampled_scan_jpeg(book).unwrap(),
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

async fn cover_paths(library: &Library) -> Vec<String> {
    let mut covers = Vec::new();
    let mut after = None;
    loop {
        let page = library.series(after).await.unwrap();
        covers.extend(
            page.series
                .into_iter()
                .map(|series| format!("/{}", series.cover.unwrap())),
        );
        match page.next {
            Some(next) => after = Some(next),
            None => return covers,
        }
    }
}

struct ColdCovers<'covers> {
    router: ResourceRouter,
    _cache: TempFolder,
    covers: Iter<'covers, String>,
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn makes_a_cold_cover_thumbnail_from_a_typical_colour_scan_within_30_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "a cold cover thumbnail from a typical 1800x2700 4:2:0 JPEG scan of about 1 MB",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(usize::try_from(BOOKS).unwrap()).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
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
    let covers = cover_paths(&library).await;
    assert_eq!(covers.len(), usize::try_from(BOOKS).unwrap());

    let outcome = trial
        .run(
            async |pass| {
                let cache = TempFolder::new(&format!("cover-speed-cache-{pass}"));
                ColdCovers {
                    router: ResourceRouter::open(cache.path()).unwrap(),
                    _cache: cache,
                    covers: covers.iter(),
                }
            },
            async |cold| {
                let cover = cold.covers.next().unwrap();
                let resource = cold.router.respond(&library, cover).await;
                assert!(matches!(resource, Resource::Immutable { .. }));
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
