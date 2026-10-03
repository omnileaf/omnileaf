#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::collections::BTreeSet;

use omnileaf_engine::{
    Inclusion, Library, LibraryFilter, LibraryListing, LibrarySort, LibrarySortBy, SortDirection,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

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

async fn titles(library: &Library, listing: LibraryListing) -> Vec<String> {
    let page = library.series(listing, None).await.unwrap();
    page.series.into_iter().map(|series| series.title).collect()
}

const fn filtered(filter: LibraryFilter) -> LibraryListing {
    LibraryListing {
        sort: LibrarySort {
            by: LibrarySortBy::Title,
            direction: SortDirection::Ascending,
        },
        filter,
    }
}

const EVERY_SERIES: LibraryFilter = LibraryFilter {
    unread: Inclusion::Any,
    started: Inclusion::Any,
    finished: Inclusion::Any,
};

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
            filter: EVERY_SERIES,
        },
    )
    .await;

    assert_eq!(
        listed,
        ["Sample Series 03", "Sample Series 02", "Sample Series 01"]
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
                ..EVERY_SERIES
            }),
        )
        .await,
        titles(
            &library,
            filtered(LibraryFilter {
                finished: Inclusion::Only,
                ..EVERY_SERIES
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
                ..EVERY_SERIES
            })
            .await
            .unwrap(),
        library
            .series_count(LibraryFilter {
                started: Inclusion::Only,
                ..EVERY_SERIES
            })
            .await
            .unwrap(),
    ];

    assert_eq!(counts, [3, 0]);
}
