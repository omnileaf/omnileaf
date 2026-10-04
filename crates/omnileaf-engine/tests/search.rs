#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{Inclusion, Library, LibraryFilter, LibrarySearch};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

const EVERY_SERIES: LibraryFilter = LibraryFilter {
    unread: Inclusion::Any,
    started: Inclusion::Any,
    finished: Inclusion::Any,
};

const ONLY_STARTED: LibraryFilter = LibraryFilter {
    started: Inclusion::Only,
    ..EVERY_SERIES
};

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

fn search(text: &str, filter: LibraryFilter) -> LibrarySearch {
    LibrarySearch {
        text: text.to_owned(),
        filter,
    }
}

async fn found(library: &Library, text: &str, filter: LibraryFilter) -> Vec<String> {
    let page = library.search(search(text, filter), None).await.unwrap();
    page.series.into_iter().map(|series| series.title).collect()
}

#[tokio::test]
async fn finds_the_series_whose_titles_hold_the_text() {
    let (library, _comics, _home) = library_with_the_sample_series("search-text").await;

    let titles = [
        found(&library, "series 02", EVERY_SERIES).await,
        found(&library, "3", EVERY_SERIES).await,
    ];

    assert_eq!(titles, [["Sample Series 02"], ["Sample Series 03"]]);
}

#[tokio::test]
async fn finds_only_the_series_the_filter_lets_through() {
    let (library, _comics, _home) = library_with_the_sample_series("search-filter").await;

    let titles = found(&library, "sample", ONLY_STARTED).await;

    assert!(titles.is_empty());
}

#[tokio::test]
async fn lists_every_series_the_filter_lets_through_when_the_text_is_blank() {
    let (library, _comics, _home) = library_with_the_sample_series("search-blank").await;

    let titles = [
        found(&library, " ", EVERY_SERIES).await,
        found(&library, "", ONLY_STARTED).await,
    ];

    assert_eq!(
        titles,
        [
            vec!["Sample Series 01", "Sample Series 02", "Sample Series 03"],
            vec![],
        ]
    );
}

#[tokio::test]
async fn counts_what_a_search_finds() {
    let (library, _comics, _home) = library_with_the_sample_series("search-count").await;

    let counts = [
        library
            .search_count(search("sample", EVERY_SERIES))
            .await
            .unwrap(),
        library
            .search_count(search("01", EVERY_SERIES))
            .await
            .unwrap(),
        library
            .search_count(search("", EVERY_SERIES))
            .await
            .unwrap(),
        library
            .search_count(search("sample", ONLY_STARTED))
            .await
            .unwrap(),
    ];

    assert_eq!(counts, [3, 1, 3, 0]);
}
