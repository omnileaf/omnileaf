#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{Library, LibraryError, LibraryListing, SeriesDetails, SeriesId};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

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

async fn first_series(library: &Library) -> SeriesId {
    library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .first()
        .unwrap()
        .id
}

#[tokio::test]
async fn keeps_no_edits_to_details_yet() {
    let (library, _comics, _home) = library_with_the_sample_series("details-kept").await;

    assert!(!library.keeps_detail_edits());
}

#[tokio::test]
async fn names_the_files_title_with_nothing_edited() {
    let (library, _comics, _home) = library_with_the_sample_series("details-file").await;
    let series = first_series(&library).await;

    let details: SeriesDetails = library.series_details(series).await.unwrap();

    assert_eq!(
        (
            details.title.from_file.as_str(),
            details.title.edited,
            details.people.from_file.len(),
            details.tags.from_file.len(),
            details.summary.from_file,
            details.is_marked_adult,
            details.is_rated_adult,
        ),
        ("Sample Series 01", None, 0, 0, None, false, false)
    );
}

#[tokio::test]
async fn says_a_series_it_does_not_hold_is_not_in_the_library() {
    let (library, _comics, _home) = library_with_the_sample_series("details-missing").await;
    let elsewhere = SeriesId::try_from("0190a3e4-0000-8000-8000-00000000ffff".to_owned()).unwrap();

    let found = library.series_details(elsewhere).await;

    assert!(matches!(found, Err(LibraryError::SeriesNotFound { .. })));
}
