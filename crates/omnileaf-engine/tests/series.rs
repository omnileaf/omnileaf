#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::collections::BTreeSet;

use omnileaf_engine::Library;
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, TempFolder};

#[tokio::test]
async fn lists_nothing_before_a_book_is_found() {
    let home = TempFolder::new("series-empty-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();

    let page = library.series(None).await.unwrap();

    assert!(page.series.is_empty());
    assert_eq!(page.next, None);
}

#[tokio::test]
async fn lists_the_series_found_by_title_each_with_a_cover() {
    let comics = TempFolder::new("series-comics");
    write_sample_library(comics.path()).unwrap();
    let home = TempFolder::new("series-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let page = library.series(None).await.unwrap();

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
async fn counts_the_series_found() {
    let comics = TempFolder::new("series-count-comics");
    write_sample_library(comics.path()).unwrap();
    let home = TempFolder::new("series-count-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let count = library.series_count().await.unwrap();

    assert_eq!(count, 3);
}

#[tokio::test]
async fn names_each_series_by_an_id_of_its_own() {
    let comics = TempFolder::new("series-ids-comics");
    write_sample_library(comics.path()).unwrap();
    let home = TempFolder::new("series-ids-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let page = library.series(None).await.unwrap();

    let ids: BTreeSet<String> = page
        .series
        .iter()
        .map(|series| series.id.to_string())
        .collect();
    assert_eq!(ids.len(), page.series.len());
}
