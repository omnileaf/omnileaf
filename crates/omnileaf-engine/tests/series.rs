#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{
    collections::BTreeSet,
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use omnileaf_engine::{
    BookId, Clock, Inclusion, Library, LibraryFilter, LibraryListing, LibrarySeries, LibrarySort,
    LibrarySortBy, ReadMark, SeriesBookListing, SeriesId, SortDirection,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, NOW_UNIX_MS, ScratchFolder};

/// The sample series in the order [`library_adding_one_series_at_a_time`] adds them, each in a folder of its own, which is not their title order.
const ADDED_ORDER: [&str; 3] = ["Sample Series 02", "Sample Series 03", "Sample Series 01"];

struct SteppingClock(AtomicU64);

impl Clock for SteppingClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.fetch_add(1, Ordering::Relaxed)
    }
}

#[tokio::test]
async fn lists_nothing_before_a_book_is_found() {
    let home = ScratchFolder::new("series-empty-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();

    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();

    assert!(page.series.is_empty());
    assert_eq!(page.next, None);
}

#[tokio::test]
async fn lists_the_series_found_by_title_each_with_a_cover() {
    let comics = ScratchFolder::new("series-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("series-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();

    let listed: Vec<(&str, u32, bool)> = page
        .series
        .iter()
        .map(|series| {
            (
                series.title.as_str(),
                series.book_count,
                series.cover.is_some(),
            )
        })
        .collect();
    assert_eq!(
        listed,
        [
            ("Sample Series 01", 3, true),
            ("Sample Series 02", 2, true),
            ("Sample Series 03", 2, true),
        ]
    );
    assert_eq!(page.next, None);
}

#[tokio::test]
async fn counts_every_book_of_a_series_just_found_as_unread() {
    let comics = ScratchFolder::new("series-unread-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("series-unread-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();

    let unread: Vec<(u32, u32)> = page
        .series
        .iter()
        .map(|series| (series.book_count, series.unread_count))
        .collect();
    assert_eq!(unread, [(3, 3), (2, 2), (2, 2)]);
}

#[tokio::test]
async fn counts_the_series_found() {
    let comics = ScratchFolder::new("series-count-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("series-count-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let count = library
        .series_count(LibraryListing::default().filter)
        .await
        .unwrap();

    assert_eq!(count, 3);
}

#[tokio::test]
async fn names_each_series_by_an_id_of_its_own() {
    let comics = ScratchFolder::new("series-ids-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("series-ids-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();

    let ids: BTreeSet<String> = page
        .series
        .iter()
        .map(|series| series.id.to_string())
        .collect();
    assert_eq!(ids.len(), page.series.len());
}

async fn library_with_the_sample_series(name: &str) -> (Library, ScratchFolder, ScratchFolder) {
    let comics = ScratchFolder::new(&format!("{name}-comics"));
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new(&format!("{name}-home"));
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();
    (library, comics, home)
}

async fn library_adding_one_series_at_a_time(
    name: &str,
) -> (Library, ScratchFolder, ScratchFolder) {
    let comics = ScratchFolder::new(&format!("{name}-comics"));
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new(&format!("{name}-home"));
    let library = Library::open(
        home.path().to_path_buf(),
        SteppingClock(AtomicU64::new(NOW_UNIX_MS)),
    )
    .await
    .unwrap();
    for series in ADDED_ORDER {
        let folder = comics.path().join(format!("{series} alone"));
        fs::create_dir_all(&folder).unwrap();
        fs::rename(
            comics.path().join(SAMPLE_LIBRARY_NAME).join(series),
            folder.join(series),
        )
        .unwrap();
        library.add_folder(folder, |_| {}).await.unwrap();
    }
    (library, comics, home)
}

fn by_date_added(direction: SortDirection) -> LibraryListing {
    LibraryListing {
        sort: LibrarySort {
            by: LibrarySortBy::DateAdded,
            direction,
        },
        filter: every_series(),
    }
}

async fn titles(library: &Library, listing: LibraryListing) -> Vec<String> {
    let page = library.series(listing, None).await.unwrap();
    page.series.into_iter().map(|series| series.title).collect()
}

fn filtered(filter: LibraryFilter) -> LibraryListing {
    LibraryListing {
        sort: LibrarySort {
            by: LibrarySortBy::Title,
            direction: SortDirection::Ascending,
        },
        filter,
    }
}

fn every_series() -> LibraryFilter {
    LibraryListing::default().filter
}

#[tokio::test]
async fn lists_the_series_found_by_title_from_z_to_a() {
    let (library, _comics, _home) = library_with_the_sample_series("series-z-to-a").await;

    let listed = titles(
        &library,
        LibraryListing {
            sort: LibrarySort {
                by: LibrarySortBy::Title,
                direction: SortDirection::Descending,
            },
            filter: every_series(),
        },
    )
    .await;

    assert_eq!(
        listed,
        ["Sample Series 03", "Sample Series 02", "Sample Series 01"]
    );
}

#[tokio::test]
async fn lists_the_series_in_the_order_they_were_added_either_way() {
    let (library, _comics, _home) =
        library_adding_one_series_at_a_time("series-by-date-added").await;

    let listed = [
        titles(&library, by_date_added(SortDirection::Ascending)).await,
        titles(&library, by_date_added(SortDirection::Descending)).await,
    ];

    assert_eq!(
        listed,
        [
            ["Sample Series 02", "Sample Series 03", "Sample Series 01"],
            ["Sample Series 01", "Sample Series 03", "Sample Series 02"],
        ]
    );
}

#[tokio::test]
async fn lists_none_of_the_series_the_filter_hides() {
    let (library, _comics, _home) = library_with_the_sample_series("series-hidden").await;

    let listed = [
        titles(
            &library,
            filtered(LibraryFilter {
                unread: Inclusion::Hide,
                ..every_series()
            }),
        )
        .await,
        titles(
            &library,
            filtered(LibraryFilter {
                finished: Inclusion::Hide,
                ..every_series()
            }),
        )
        .await,
    ];

    assert_eq!(
        listed,
        [
            vec![],
            vec!["Sample Series 01", "Sample Series 02", "Sample Series 03"],
        ]
    );
}

#[tokio::test]
async fn lists_only_the_series_the_filter_lets_through() {
    let (library, _comics, _home) = library_with_the_sample_series("series-filtered").await;

    let listed = [
        titles(
            &library,
            filtered(LibraryFilter {
                unread: Inclusion::Only,
                ..every_series()
            }),
        )
        .await,
        titles(
            &library,
            filtered(LibraryFilter {
                finished: Inclusion::Only,
                ..every_series()
            }),
        )
        .await,
    ];

    assert_eq!(
        listed,
        [
            vec!["Sample Series 01", "Sample Series 02", "Sample Series 03"],
            vec![],
        ]
    );
}

#[tokio::test]
async fn counts_only_the_series_the_filter_lets_through() {
    let (library, _comics, _home) = library_with_the_sample_series("series-filtered-count").await;

    let counts = [
        library
            .series_count(LibraryFilter {
                started: Inclusion::Hide,
                ..every_series()
            })
            .await
            .unwrap(),
        library
            .series_count(LibraryFilter {
                started: Inclusion::Only,
                ..every_series()
            })
            .await
            .unwrap(),
    ];

    assert_eq!(counts, [3, 0]);
}

#[tokio::test]
async fn marks_every_book_of_the_series_chosen_read_and_names_the_ones_it_marked() {
    let (library, _comics, _home) = library_with_the_sample_series("series-marked-read").await;
    let listed = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let chosen: Vec<SeriesId> = listed.series.iter().take(2).map(|one| one.id).collect();
    let unread_before: u32 = listed
        .series
        .iter()
        .take(2)
        .map(|one| one.unread_count)
        .sum();

    let marked = library.mark_series_read(chosen.clone()).await.unwrap();

    let after = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let unread_after: u32 = after
        .series
        .iter()
        .filter(|one| chosen.contains(&one.id))
        .map(|one| one.unread_count)
        .sum();
    assert_eq!((marked.len(), unread_after), (unread_before as usize, 0));
}

#[tokio::test]
async fn leaves_the_series_as_before_once_the_books_it_marked_read_are_marked_unread() {
    let (library, _comics, _home) = library_with_the_sample_series("series-marked-back").await;
    let before = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let chosen: Vec<SeriesId> = before.series.iter().take(2).map(|one| one.id).collect();

    let marked = library.mark_series_read(chosen).await.unwrap();
    library.mark_books(marked, ReadMark::Unread).await.unwrap();

    let after = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    assert_eq!(after.series, before.series);
}

async fn first_series(library: &Library) -> LibrarySeries {
    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    page.series.into_iter().next().unwrap()
}

async fn books_of(library: &Library, series: SeriesId) -> Vec<BookId> {
    let page = library
        .series_books(series, SeriesBookListing::default(), None)
        .await
        .unwrap();
    page.books.into_iter().map(|book| book.id).collect()
}

#[tokio::test]
async fn continues_a_series_from_its_first_book_not_marked_read() {
    let (library, _comics, _home) = library_with_the_sample_series("series-continued").await;
    let books = books_of(&library, first_series(&library).await.id).await;
    library
        .mark_books(vec![books[0]], ReadMark::Read)
        .await
        .unwrap();

    let continued = first_series(&library).await.continues_from;

    assert_eq!(continued, Some(books[1]));
}

#[tokio::test]
async fn offers_no_book_to_continue_in_a_series_not_yet_started() {
    let (library, _comics, _home) = library_with_the_sample_series("series-not-started").await;

    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();

    let continued: Vec<Option<BookId>> = page
        .series
        .iter()
        .map(|series| series.continues_from)
        .collect();
    assert_eq!(continued, [None, None, None]);
}

#[tokio::test]
async fn offers_no_book_to_continue_in_a_series_read_to_the_end() {
    let (library, _comics, _home) = library_with_the_sample_series("series-read-through").await;
    library
        .mark_series_read(vec![first_series(&library).await.id])
        .await
        .unwrap();

    let continued = first_series(&library).await.continues_from;

    assert_eq!(continued, None);
}

#[tokio::test]
async fn finds_the_file_of_a_series_first_book_to_show_in_its_folder() {
    let comics = ScratchFolder::new("series-file-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("series-file-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();
    let page = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let first = page.series.first().unwrap();

    let file = library.series_file(first.id).await.unwrap().unwrap();

    assert_eq!(
        (file.parent().map(Path::to_path_buf), file.is_file()),
        (
            Some(
                comics
                    .path()
                    .join(SAMPLE_LIBRARY_NAME)
                    .join("Sample Series 01")
            ),
            true
        )
    );
}
