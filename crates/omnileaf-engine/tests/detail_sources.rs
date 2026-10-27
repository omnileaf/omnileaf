#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write archives, so the other kinds of book go unused"
)]
mod books;
#[expect(
    dead_code,
    reason = "these tests read a series' details through the library, never the catalog rows"
)]
mod scanned;
mod support;

use books::write_book_with;
use omnileaf_engine::{
    EditedTitle, LibraryListing, SeriesDetails, SourcedLanguage, SourcedYear, ValueSource,
};
use scanned::Scanned;
use support::ScratchFolder;

const NO_DETAILS: &str = "<ComicInfo><Writer>Sample Author</Writer></ComicInfo>";
const NAMED_DATED_AND_IN_JAPANESE: &str = "<ComicInfo><Series>Sample Series 05</Series>\
    <Year>2021</Year><LanguageISO>ja</LanguageISO></ComicInfo>";

async fn details_of_the_only_series(name: &str, book: &str, comic_info: &str) -> SeriesDetails {
    let comics = ScratchFolder::new(name);
    write_book_with(&comics.path().join(book), 1, Some(comic_info));
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    let listed = scanned
        .library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let series = listed.series.first().unwrap().id;
    scanned.library.series_details(series).await.unwrap()
}

#[tokio::test]
async fn names_the_folder_and_file_names_a_series_title_year_and_language_came_from() {
    let details = details_of_the_only_series(
        "detail-sources-names",
        "Sample Series 04 (2019)/Sample Series 04 v01 [JA].cbz",
        NO_DETAILS,
    )
    .await;

    assert_eq!(
        (details.title, details.year, details.language),
        (
            EditedTitle {
                from_file: "Sample Series 04".to_owned(),
                source: Some(ValueSource::FolderName),
                edited: None,
            },
            Some(SourcedYear {
                from_file: 2019,
                source: ValueSource::FolderName,
            }),
            Some(SourcedLanguage {
                from_file: "ja".to_owned(),
                source: ValueSource::FileName,
            }),
        )
    );
}

#[tokio::test]
async fn names_the_files_as_where_comic_info_values_came_from() {
    let details = details_of_the_only_series(
        "detail-sources-files",
        "Sample Series 04 (2019)/Sample Series 04 v01 [EN].cbz",
        NAMED_DATED_AND_IN_JAPANESE,
    )
    .await;

    assert_eq!(
        (details.title, details.year, details.language),
        (
            EditedTitle {
                from_file: "Sample Series 05".to_owned(),
                source: Some(ValueSource::Files),
                edited: None,
            },
            Some(SourcedYear {
                from_file: 2021,
                source: ValueSource::Files,
            }),
            Some(SourcedLanguage {
                from_file: "ja".to_owned(),
                source: ValueSource::Files,
            }),
        )
    );
}
