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
use omnileaf_engine::{
    AdultContent, CreatorRole, CreatorSeries, Library, LibraryListing, LibrarySeries,
    SeriesCreator, SeriesId, SeriesPerson,
};
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

const FIRST_VOLUME: &str = "<ComicInfo>
    <Writer>Sample Author</Writer>
    <Penciller>Sample Artist</Penciller>
    <Letterer>Sample Letterer</Letterer>
    <Format>Digital</Format>
    <Tags>harbour</Tags>
</ComicInfo>";
const SECOND_VOLUME: &str = "<ComicInfo>
    <Summary>A sample summary.</Summary>
    <Writer>Sample Author</Writer>
    <Penciller>Sample Author</Penciller>
    <Format>Print</Format>
    <Genre>Mystery</Genre>
    <AgeRating>X18+</AgeRating>
</ComicInfo>";
const BY_THE_SAME_AUTHOR: &str = "<ComicInfo><Writer>Sample Author</Writer></ComicInfo>";

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

    async fn series_named(&self, title: &str) -> SeriesId {
        self.listed()
            .await
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
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

fn creator(name: &str, role: Option<CreatorRole>, series_count: u32) -> SeriesCreator {
    SeriesCreator {
        name: name.to_owned(),
        role,
        series_count,
    }
}

fn person(name: &str, role: Option<CreatorRole>) -> SeriesPerson {
    SeriesPerson {
        name: name.to_owned(),
        role,
    }
}

async fn scanned_with_two_volumes(name: &str) -> Scanned {
    Scanned::with(
        name,
        &[
            (SERIES_01, FIRST_VOLUME),
            (SERIES_01, SECOND_VOLUME),
            (SERIES_02, BY_THE_SAME_AUTHOR),
        ],
    )
    .await
}

#[tokio::test]
async fn sums_up_a_series_with_the_format_summary_creators_and_tags_its_books_give() {
    let scanned = scanned_with_two_volumes("details-overview").await;
    let series = scanned.series_named(SERIES_01).await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    assert_eq!(
        (overview.format.as_deref(), overview.summary.as_deref()),
        (Some("Digital"), Some("A sample summary."))
    );
    assert_eq!(
        overview.creators,
        [
            creator("Sample Artist", Some(CreatorRole::Art), 1),
            creator("Sample Author", Some(CreatorRole::StoryAndArt), 2),
            creator("Sample Letterer", None, 1),
        ]
    );
    assert_eq!(overview.tags, ["harbour", "Mystery"]);
}

#[tokio::test]
async fn gives_the_details_a_series_files_name_with_nothing_edited() {
    let scanned = scanned_with_two_volumes("details-from-files").await;
    let series = scanned.series_named(SERIES_01).await;

    let details = scanned.library.series_details(series).await.unwrap();

    assert_eq!(
        (
            details.title.from_file.as_str(),
            details.summary.from_file.as_deref(),
            details.tags.from_file.as_slice(),
            details.is_rated_adult,
        ),
        (
            SERIES_01,
            Some("A sample summary."),
            ["harbour".to_owned(), "Mystery".to_owned()].as_slice(),
            true
        )
    );
    assert_eq!(
        details.people.from_file,
        [
            person("Sample Artist", Some(CreatorRole::Art)),
            person("Sample Author", Some(CreatorRole::StoryAndArt)),
            person("Sample Letterer", None),
        ]
    );
}

#[tokio::test]
async fn lists_the_series_a_creator_is_named_in_with_what_they_did_on_each() {
    let scanned = scanned_with_two_volumes("details-creator-series").await;
    let listed = scanned.listed().await;

    let found = scanned
        .library
        .creator_series("Sample Author".to_owned())
        .await
        .unwrap();

    let roles: Vec<(&str, Option<CreatorRole>)> = found
        .iter()
        .map(|series: &CreatorSeries| (series.title.as_str(), series.role))
        .collect();
    assert_eq!(
        roles,
        [
            (SERIES_01, Some(CreatorRole::StoryAndArt)),
            (SERIES_02, Some(CreatorRole::Story))
        ]
    );
    assert_eq!(
        found.iter().map(|series| series.id).collect::<Vec<_>>(),
        listed.iter().map(|series| series.id).collect::<Vec<_>>()
    );
}
