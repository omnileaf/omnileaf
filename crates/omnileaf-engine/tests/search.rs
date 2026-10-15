#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{
    Inclusion, Library, LibraryError, LibraryFilter, LibraryListing, LibrarySearch,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

fn every_series() -> LibraryFilter {
    LibraryListing::default().filter
}

fn only_started() -> LibraryFilter {
    LibraryFilter {
        started: Inclusion::Only,
        ..every_series()
    }
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
        found(&library, "series 02", every_series()).await,
        found(&library, "3", every_series()).await,
    ];

    assert_eq!(titles, [["Sample Series 02"], ["Sample Series 03"]]);
}

#[tokio::test]
async fn finds_only_the_series_the_filter_lets_through() {
    let (library, _comics, _home) = library_with_the_sample_series("search-filter").await;

    let titles = found(&library, "sample", only_started()).await;

    assert!(titles.is_empty());
}

#[tokio::test]
async fn lists_every_series_the_filter_lets_through_when_the_text_is_blank() {
    let (library, _comics, _home) = library_with_the_sample_series("search-blank").await;

    let titles = [
        found(&library, " ", every_series()).await,
        found(&library, "", only_started()).await,
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
            .search_count(search("sample", every_series()))
            .await
            .unwrap(),
        library
            .search_count(search("01", every_series()))
            .await
            .unwrap(),
        library
            .search_count(search("", every_series()))
            .await
            .unwrap(),
        library
            .search_count(search("sample", only_started()))
            .await
            .unwrap(),
    ];

    assert_eq!(counts, [3, 1, 3, 0]);
}

#[tokio::test]
async fn refuses_text_longer_than_a_search_reads_as_a_search_too_long() {
    let (library, _comics, _home) = library_with_the_sample_series("search-too-long").await;
    let too_long = "s".repeat(usize::from(LibrarySearch::MAX_CHARS) + 1);

    let refusals = [
        library
            .search(search(&too_long, every_series()), None)
            .await
            .err(),
        library
            .search_count(search(&too_long, every_series()))
            .await
            .err(),
    ];

    assert!(
        refusals
            .iter()
            .all(|refusal| matches!(refusal, Some(LibraryError::SearchTooLong { .. }))),
        "{refusals:?}"
    );
}
