#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with ComicInfo, so the other kinds of book go unused"
)]
mod books;
mod support;

use books::write_book_with;
use omnileaf_engine::{AdultContent, Library, LibraryListing, LibrarySeries};
use support::{FixedClock, ScratchFolder};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const ADULT_IN_JAPANESE: &str = "<ComicInfo>
    <Genre>Mystery</Genre>
    <Tags>harbour, storms</Tags>
    <LanguageISO>ja</LanguageISO>
    <AgeRating>R18+</AgeRating>
</ComicInfo>";
const EVERYONE_IN_ENGLISH: &str = "<ComicInfo>
    <Tags>storms</Tags>
    <LanguageISO>en</LanguageISO>
    <AgeRating>Everyone</AgeRating>
</ComicInfo>";

struct Scanned {
    library: Library,
    _comics: ScratchFolder,
    _home: ScratchFolder,
}

impl Scanned {
    async fn with(name: &str, books: &[(&str, &str)]) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        for (seed, (series, comic_info)) in (1..).zip(books) {
            let book = comics.path().join(series).join(format!("v{seed:02}.cbz"));
            write_book_with(&book, seed, Some(comic_info));
        }
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.path().to_path_buf(), |_| {})
            .await
            .unwrap();
        Self {
            library,
            _comics: comics,
            _home: home,
        }
    }

    async fn listed(&self) -> Vec<LibrarySeries> {
        self.library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
    }
}

#[tokio::test]
async fn lists_each_series_in_the_language_its_books_name() {
    let scanned = Scanned::with(
        "details-language",
        &[
            (SERIES_01, ADULT_IN_JAPANESE),
            (SERIES_02, EVERYONE_IN_ENGLISH),
        ],
    )
    .await;

    let listed = scanned.listed().await;

    let languages: Vec<Option<&str>> = listed
        .iter()
        .map(|series| series.language.as_deref())
        .collect();
    assert_eq!(languages, [Some("ja"), Some("en")]);
}

#[tokio::test]
async fn counts_a_series_its_files_rate_18_plus_as_adult_while_age_ratings_count() {
    let scanned = Scanned::with(
        "details-adult",
        &[
            (SERIES_01, ADULT_IN_JAPANESE),
            (SERIES_02, EVERYONE_IN_ENGLISH),
        ],
    )
    .await;
    let counted: Vec<bool> = scanned
        .listed()
        .await
        .iter()
        .map(|series| series.is_adult)
        .collect();

    scanned
        .library
        .set_adult_content(AdultContent {
            counts_age_ratings: false,
            ..AdultContent::default()
        })
        .await
        .unwrap();

    let uncounted: Vec<bool> = scanned
        .listed()
        .await
        .iter()
        .map(|series| series.is_adult)
        .collect();
    assert_eq!(
        (counted, uncounted),
        (vec![true, false], vec![false, false])
    );
}

#[tokio::test]
async fn offers_the_languages_and_tags_the_library_holds_to_filter_by() {
    let scanned = Scanned::with(
        "details-filter-choices",
        &[
            (SERIES_01, ADULT_IN_JAPANESE),
            (SERIES_02, EVERYONE_IN_ENGLISH),
        ],
    )
    .await;

    let choices = scanned.library.filter_choices().await.unwrap();

    assert_eq!(
        (choices.languages, choices.tags),
        (
            vec!["en".to_owned(), "ja".to_owned()],
            vec![
                "harbour".to_owned(),
                "Mystery".to_owned(),
                "storms".to_owned()
            ]
        )
    );
}
