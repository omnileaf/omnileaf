#![expect(
    clippy::unwrap_used,
    reason = "the library is a generated fixture, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "this test needs scratch folders but none of the files support can put in them"
)]
mod support;

use std::{fs, num::NonZeroUsize, path::Path, time::Duration, vec::IntoIter};

use omnileaf_engine::{
    BookId, Library, LibraryListing, Resource, ResourceRouter, SeriesBookListing,
};
use omnileaf_testkit::{
    ArchiveEntry, Compression, Sampling, SpeedTrial, Statistic, TimingBudget, cbz,
    subsampled_scan_jpeg,
};
use support::{FixedClock, ScratchFolder};

const BOOKS: u64 = 40;
const PAGES_PER_BOOK: usize = 30;
const FOLDER: &str = "Scanned Library";
const BUDGET: Duration = Duration::from_millis(150);

fn write_scanned_library(root: &Path) {
    for book in 0..BOOKS {
        let series = format!("Sample Series {book:02}");
        let scan = subsampled_scan_jpeg(book).unwrap();
        let entries: Vec<ArchiveEntry> = (0..PAGES_PER_BOOK)
            .map(|index| ArchiveEntry {
                name: format!("{index:03}.jpg"),
                bytes: scan.clone(),
            })
            .collect();
        let folder = root.join(&series);
        fs::create_dir_all(&folder).unwrap();
        fs::write(
            folder.join(format!("{series} v01.cbz")),
            cbz(&entries, Compression::Stored).unwrap(),
        )
        .unwrap();
    }
}

async fn every_book(library: &Library) -> Vec<BookId> {
    let mut books = Vec::new();
    let mut after = None;
    loop {
        let page = library
            .series(LibraryListing::default(), after)
            .await
            .unwrap();
        for series in &page.series {
            let listed = library
                .series_books(series.id, SeriesBookListing::default(), None)
                .await
                .unwrap();
            books.extend(listed.books.into_iter().map(|book| book.id));
        }
        match page.next {
            Some(next) => after = Some(next),
            None => return books,
        }
    }
}

/// A library and cache of their own for each pass, so every book a pass opens is one it never opened before.
struct UnopenedBooks {
    library: Library,
    router: ResourceRouter,
    books: IntoIter<BookId>,
    _home: ScratchFolder,
    _cache: ScratchFolder,
}

impl UnopenedBooks {
    async fn of(comics: &Path, pass: &str) -> Self {
        let home = ScratchFolder::new(&format!("page-speed-home-{pass}"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.to_path_buf(), |_| {})
            .await
            .unwrap();
        let books = every_book(&library).await;
        assert_eq!(books.len(), usize::try_from(BOOKS).unwrap());
        let cache = ScratchFolder::new(&format!("page-speed-cache-{pass}"));
        Self {
            router: ResourceRouter::open(cache.path()).unwrap(),
            library,
            books: books.into_iter(),
            _home: home,
            _cache: cache,
        }
    }
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn opens_a_book_never_opened_before_to_its_first_page_within_150_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "the first page of a book of 30 1800x2700 4:2:0 JPEG scans never opened before, the sizes of the pages around it read on the way and the rest left for later",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(usize::try_from(BOOKS).unwrap()).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let comics = ScratchFolder::new("page-speed-comics");
    let folder = comics.path().join(FOLDER);
    write_scanned_library(&folder);

    let outcome = trial
        .run(
            async |pass| UnopenedBooks::of(&folder, &pass.to_string()).await,
            async |unopened| {
                let book = unopened.books.next().unwrap();
                let opened = unopened
                    .router
                    .open_book(&unopened.library, book, Vec::new())
                    .await
                    .unwrap();
                let first = unopened
                    .router
                    .respond(&unopened.library, &format!("/{}", opened.pages[0].path))
                    .await;
                assert!(matches!(first, Resource::Immutable { .. }));
                assert_eq!(opened.pages.len(), PAGES_PER_BOOK);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
