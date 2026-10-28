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
    AdultContent, AdultTreatment, CreatorRole, CreatorSeries, Inclusion, Library, LibraryFilter,
    LibraryListing, LibrarySeries, RelatedReason, SeriesCreator, SeriesId, SeriesPerson,
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

const STORMS_BY_AUTHOR_AND_ARTIST: &str = "<ComicInfo>
    <Writer>Sample Author</Writer>
    <Penciller>Sample Artist</Penciller>
    <Tags>harbour, storms</Tags>
</ComicInfo>";
const DRAWN_BY_THE_SAME_ARTIST: &str =
    "<ComicInfo><Writer>Another Author</Writer><Inker>Sample Artist</Inker></ComicInfo>";
const TAGGED_STORMS: &str = "<ComicInfo><Tags>storms</Tags></ComicInfo>";
const BY_THE_SAME_AUTHOR_TAGGED_STORMS: &str =
    "<ComicInfo><Writer>Sample Author</Writer><Tags>storms</Tags></ComicInfo>";
const SHARING_NOTHING: &str =
    "<ComicInfo><Writer>Another Author</Writer><Tags>trains</Tags></ComicInfo>";

fn reasons(related: &[omnileaf_engine::RelatedSeries]) -> Vec<(&str, &RelatedReason)> {
    related
        .iter()
        .map(|series| (series.title.as_str(), &series.reason))
        .collect()
}

#[tokio::test]
async fn lists_the_series_sharing_a_writer_an_artist_or_a_tag_each_once_by_its_closest_tie() {
    let scanned = Scanned::with(
        "related-reasons",
        &[
            ("Sample Series 01", STORMS_BY_AUTHOR_AND_ARTIST),
            ("Sample Series 02", TAGGED_STORMS),
            ("Sample Series 03", DRAWN_BY_THE_SAME_ARTIST),
            ("Sample Series 04", BY_THE_SAME_AUTHOR_TAGGED_STORMS),
            ("Sample Series 05", BY_THE_SAME_AUTHOR),
            ("Sample Series 06", SHARING_NOTHING),
        ],
    )
    .await;
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    assert_eq!(
        reasons(&overview.related),
        [
            ("Sample Series 04", &RelatedReason::SameWriter),
            ("Sample Series 05", &RelatedReason::SameWriter),
            ("Sample Series 03", &RelatedReason::SameArtist),
            (
                "Sample Series 02",
                &RelatedReason::SharedTag {
                    tag: "storms".to_owned()
                }
            ),
        ]
    );
}

#[tokio::test]
async fn names_the_rarest_tag_a_related_series_shares() {
    let action_and_cooking = "<ComicInfo><Tags>action, cooking</Tags></ComicInfo>";
    let action = "<ComicInfo><Tags>action</Tags></ComicInfo>";
    let scanned = Scanned::with(
        "related-rarest-tag",
        &[
            ("Sample Series 01", action_and_cooking),
            ("Sample Series 02", action_and_cooking),
            ("Sample Series 03", action),
            ("Sample Series 04", action),
        ],
    )
    .await;
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    assert_eq!(
        reasons(&overview.related)[0],
        (
            "Sample Series 02",
            &RelatedReason::SharedTag {
                tag: "cooking".to_owned()
            }
        )
    );
}

#[tokio::test]
async fn lists_no_related_series_when_none_shares_a_creator_or_a_tag() {
    let scanned = Scanned::with(
        "related-none",
        &[
            ("Sample Series 01", STORMS_BY_AUTHOR_AND_ARTIST),
            ("Sample Series 02", SHARING_NOTHING),
        ],
    )
    .await;
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    assert_eq!(overview.related, []);
}

#[tokio::test]
async fn lists_at_most_twelve_related_series() {
    let books: Vec<(String, &str)> = (1..=14)
        .map(|number| (format!("Sample Series {number:02}"), BY_THE_SAME_AUTHOR))
        .collect();
    let named: Vec<(&str, &str)> = books
        .iter()
        .map(|(series, info)| (series.as_str(), *info))
        .collect();
    let scanned = Scanned::with("related-twelve", &named).await;
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    assert_eq!(overview.related.len(), 12);
}

#[tokio::test]
async fn marks_a_related_series_its_files_rate_18_plus_as_adult() {
    let scanned = Scanned::with(
        "related-adult",
        &[
            ("Sample Series 01", EVERYONE_IN_ENGLISH),
            ("Sample Series 02", ADULT_IN_JAPANESE),
        ],
    )
    .await;
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    let adult: Vec<(&str, bool)> = overview
        .related
        .iter()
        .map(|related| (related.title.as_str(), related.is_adult))
        .collect();
    assert_eq!(adult, [("Sample Series 02", true)]);
}

#[tokio::test]
async fn leaves_18_plus_series_out_of_the_related_series_while_they_are_hidden() {
    let scanned = Scanned::with(
        "related-adult-hidden",
        &[
            ("Sample Series 01", EVERYONE_IN_ENGLISH),
            ("Sample Series 02", ADULT_IN_JAPANESE),
            ("Sample Series 03", TAGGED_STORMS),
        ],
    )
    .await;
    scanned
        .library
        .set_adult_content(AdultContent {
            treatment: AdultTreatment::Hide,
            ..AdultContent::default()
        })
        .await
        .unwrap();
    let series = scanned.series_named("Sample Series 01").await;

    let overview = scanned.library.series_overview(series).await.unwrap();

    let titles: Vec<&str> = overview
        .related
        .iter()
        .map(|related| related.title.as_str())
        .collect();
    assert_eq!(titles, ["Sample Series 03"]);
}

fn filtered(filter: LibraryFilter) -> LibraryListing {
    LibraryListing {
        filter,
        ..LibraryListing::default()
    }
}

fn in_languages(languages: &[&str]) -> LibraryFilter {
    LibraryFilter {
        languages: languages.iter().map(|&code| code.to_owned()).collect(),
        ..LibraryListing::default().filter
    }
}

fn adult(inclusion: Inclusion) -> LibraryFilter {
    LibraryFilter {
        adult: inclusion,
        ..LibraryListing::default().filter
    }
}

impl Scanned {
    async fn titles(&self, filter: LibraryFilter) -> Vec<String> {
        self.library
            .series(filtered(filter), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| series.title)
            .collect()
    }
}

async fn in_two_languages(name: &str) -> Scanned {
    Scanned::with(
        name,
        &[
            (SERIES_01, ADULT_IN_JAPANESE),
            (SERIES_02, EVERYONE_IN_ENGLISH),
        ],
    )
    .await
}

#[tokio::test]
async fn lists_and_counts_only_the_series_in_the_chosen_languages() {
    let scanned = in_two_languages("filter-languages").await;

    let listed = scanned.titles(in_languages(&["ja"])).await;
    let counted = scanned
        .library
        .series_count(in_languages(&["en", "fr"]))
        .await
        .unwrap();

    assert_eq!(
        (listed.as_slice(), counted),
        ([SERIES_01.to_owned()].as_slice(), 1)
    );
}

#[tokio::test]
async fn lists_only_or_hides_the_series_counted_as_18_plus() {
    let scanned = in_two_languages("filter-adult").await;

    let listed = [
        scanned.titles(adult(Inclusion::Only)).await,
        scanned.titles(adult(Inclusion::Hide)).await,
    ];

    assert_eq!(listed, [[SERIES_01], [SERIES_02]]);
}

#[tokio::test]
async fn counts_no_series_as_18_plus_once_age_ratings_stop_counting() {
    let scanned = in_two_languages("filter-adult-uncounted").await;
    scanned
        .library
        .set_adult_content(AdultContent {
            counts_age_ratings: false,
            ..AdultContent::default()
        })
        .await
        .unwrap();

    let listed = scanned.titles(adult(Inclusion::Only)).await;

    assert_eq!(listed, Vec::<String>::new());
}

#[tokio::test]
async fn offers_the_18_plus_filter_once_a_series_counts_as_18_plus() {
    let scanned = in_two_languages("filter-adult-choice").await;

    let offered = scanned.library.filter_choices().await.unwrap().rates_adult;

    assert!(offered);
}

fn tagged(tags: &[&str]) -> LibraryFilter {
    LibraryFilter {
        tags: tags.iter().map(|&tag| tag.to_owned()).collect(),
        ..LibraryListing::default().filter
    }
}

#[tokio::test]
async fn lists_and_counts_the_series_carrying_one_of_the_chosen_tags_or_genres() {
    let scanned = Scanned::with(
        "filter-tags",
        &[
            (SERIES_01, ADULT_IN_JAPANESE),
            (SERIES_02, EVERYONE_IN_ENGLISH),
            ("Sample Series 03", SHARING_NOTHING),
        ],
    )
    .await;

    let listed = [
        scanned.titles(tagged(&["harbour"])).await,
        scanned.titles(tagged(&["storms", "trains"])).await,
        scanned.titles(tagged(&["Mystery"])).await,
        scanned.titles(tagged(&["unheard of"])).await,
    ];
    let counted = scanned
        .library
        .series_count(tagged(&["storms", "trains"]))
        .await
        .unwrap();

    assert_eq!(
        (listed, counted),
        (
            [
                vec![SERIES_01.to_owned()],
                vec![
                    SERIES_01.to_owned(),
                    SERIES_02.to_owned(),
                    "Sample Series 03".to_owned()
                ],
                vec![SERIES_01.to_owned()],
                Vec::new(),
            ],
            3
        )
    );
}
