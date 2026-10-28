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
    AdultContent, AdultTreatment, CreatorRole, DetailEdits, Inclusion, Library, LibraryError,
    LibraryFilter, LibraryListing, LibrarySearch, LibrarySeries, LibrarySort, LibrarySortBy,
    SeriesId, SeriesPerson, SortDirection,
};
use support::{FixedClock, ScratchFolder};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const WRITTEN_AND_TAGGED: &str = "<ComicInfo>
    <Summary>A file summary.</Summary>
    <Writer>File Writer</Writer>
    <Tags>storms</Tags>
</ComicInfo>";
const PLAIN: &str = "<ComicInfo><Tags>trains</Tags></ComicInfo>";
const RATED_18: &str = "<ComicInfo><Tags>trains</Tags><AgeRating>R18+</AgeRating></ComicInfo>";
const SERIES_03: &str = "Sample Series 03";

struct Scanned {
    library: Library,
    comics: ScratchFolder,
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
            comics,
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

    async fn series_named(&self, title: &str) -> SeriesId {
        self.listed()
            .await
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn titles(&self, listing: LibraryListing) -> Vec<String> {
        self.library
            .series(listing, None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| series.title)
            .collect()
    }

    async fn found(&self, text: &str) -> Vec<String> {
        let search = LibrarySearch {
            text: text.to_owned(),
            filter: LibraryListing::default().filter,
        };
        self.library
            .search(search, None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| series.title)
            .collect()
    }
}

fn nothing_edited() -> DetailEdits {
    DetailEdits {
        title: None,
        people: None,
        tags: None,
        summary: None,
        is_marked_adult: false,
    }
}

fn person(name: &str, role: Option<CreatorRole>) -> SeriesPerson {
    SeriesPerson {
        name: name.to_owned(),
        role,
    }
}

async fn two_series(name: &str) -> Scanned {
    Scanned::with(name, &[(SERIES_01, WRITTEN_AND_TAGGED), (SERIES_02, PLAIN)]).await
}

#[tokio::test]
async fn shows_each_edit_beside_the_files_value_and_falls_back_to_it_once_cleared() {
    let scanned = two_series("detail-edits-fallback").await;
    let series = scanned.series_named(SERIES_01).await;
    let edits = DetailEdits {
        title: Some("Edited Title".to_owned()),
        people: Some(vec![person("Edited Artist", Some(CreatorRole::Art))]),
        tags: Some(vec!["lanterns".to_owned()]),
        summary: Some("An edited summary.".to_owned()),
        is_marked_adult: true,
    };

    scanned
        .library
        .edit_series_details(series, edits)
        .await
        .unwrap();
    let edited = scanned.library.series_details(series).await.unwrap();
    scanned
        .library
        .edit_series_details(series, nothing_edited())
        .await
        .unwrap();
    let cleared = scanned.library.series_details(series).await.unwrap();

    assert_eq!(edited.title.from_file, SERIES_01);
    assert_eq!(edited.title.edited.as_deref(), Some("Edited Title"));
    assert_eq!(
        edited.people.edited,
        Some(vec![person("Edited Artist", Some(CreatorRole::Art))])
    );
    assert_eq!(
        edited.people.from_file,
        [person("File Writer", Some(CreatorRole::Story))]
    );
    assert_eq!(edited.tags.edited, Some(vec!["lanterns".to_owned()]));
    assert_eq!(edited.tags.from_file, ["storms"]);
    assert_eq!(edited.summary.edited.as_deref(), Some("An edited summary."));
    assert_eq!(edited.summary.from_file.as_deref(), Some("A file summary."));
    assert!(edited.is_marked_adult && !edited.is_rated_adult);
    assert_eq!(
        (
            cleared.title.edited,
            cleared.people.edited,
            cleared.tags.edited,
            cleared.summary.edited,
            cleared.is_marked_adult,
        ),
        (None, None, None, None, false)
    );
}

#[tokio::test]
async fn shows_the_series_page_the_edited_people_tags_and_summary() {
    let scanned = two_series("detail-edits-overview").await;
    let series = scanned.series_named(SERIES_01).await;

    scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                people: Some(vec![person("Edited Artist", Some(CreatorRole::Art))]),
                tags: Some(vec!["lanterns".to_owned()]),
                summary: Some("An edited summary.".to_owned()),
                ..nothing_edited()
            },
        )
        .await
        .unwrap();

    let overview = scanned.library.series_overview(series).await.unwrap();
    assert_eq!(
        overview
            .creators
            .iter()
            .map(|creator| (creator.name.as_str(), creator.role))
            .collect::<Vec<_>>(),
        [("Edited Artist", Some(CreatorRole::Art))]
    );
    assert_eq!(overview.tags, ["lanterns"]);
    assert_eq!(overview.summary.as_deref(), Some("An edited summary."));
}

#[tokio::test]
async fn finds_and_sorts_a_series_by_its_edited_title() {
    let scanned = two_series("detail-edits-title").await;
    let series = scanned.series_named(SERIES_01).await;
    let by_title = LibraryListing {
        sort: LibrarySort {
            by: LibrarySortBy::Title,
            direction: SortDirection::Ascending,
        },
        ..LibraryListing::default()
    };

    scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                title: Some("Zebra Crossing".to_owned()),
                ..nothing_edited()
            },
        )
        .await
        .unwrap();

    assert_eq!(
        scanned.titles(by_title).await,
        [SERIES_02, "Zebra Crossing"]
    );
    assert_eq!(scanned.found("Zebra").await, ["Zebra Crossing"]);
    assert_eq!(scanned.found("Series 01").await, Vec::<String>::new());
}

#[tokio::test]
async fn filters_and_searches_by_the_edited_tags_and_groups_by_the_edited_writer() {
    let scanned = two_series("detail-edits-tags-people").await;
    let series = scanned.series_named(SERIES_01).await;
    scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                people: Some(vec![person("Edited Writer", Some(CreatorRole::Story))]),
                tags: Some(vec!["lanterns".to_owned()]),
                ..nothing_edited()
            },
        )
        .await
        .unwrap();
    let tagged = |tag: &str| LibraryListing {
        filter: LibraryFilter {
            tags: vec![tag.to_owned()],
            ..LibraryListing::default().filter
        },
        ..LibraryListing::default()
    };

    assert_eq!(scanned.titles(tagged("lanterns")).await, [SERIES_01]);
    assert_eq!(scanned.titles(tagged("storms")).await, Vec::<String>::new());
    assert_eq!(scanned.found("lanterns").await, [SERIES_01]);
    assert_eq!(scanned.found("Edited Writer").await, [SERIES_01]);
    assert_eq!(scanned.found("File Writer").await, Vec::<String>::new());
    let writers = scanned.library.writers(None).await.unwrap().writers;
    assert_eq!(
        writers
            .iter()
            .map(|writer| writer.name.as_str())
            .collect::<Vec<_>>(),
        ["Edited Writer"]
    );
    let choices = scanned.library.filter_choices().await.unwrap();
    assert_eq!(choices.tags, ["lanterns", "trains"]);
}

fn with_adult(adult: Inclusion) -> LibraryListing {
    LibraryListing {
        filter: LibraryFilter {
            adult,
            ..LibraryListing::default().filter
        },
        ..LibraryListing::default()
    }
}

#[tokio::test]
async fn counts_a_series_marked_by_hand_as_adult_in_the_filters_and_the_flag_of_each_series() {
    let scanned = two_series("detail-edits-adult").await;
    let series = scanned.series_named(SERIES_01).await;
    let before = scanned.library.filter_choices().await.unwrap().rates_adult;

    scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                is_marked_adult: true,
                ..nothing_edited()
            },
        )
        .await
        .unwrap();

    assert!(!before && scanned.library.filter_choices().await.unwrap().rates_adult);
    assert_eq!(
        scanned.titles(with_adult(Inclusion::Only)).await,
        [SERIES_01]
    );
    assert_eq!(
        scanned.titles(with_adult(Inclusion::Hide)).await,
        [SERIES_02]
    );
    assert_eq!(
        scanned
            .library
            .series_count(with_adult(Inclusion::Hide).filter)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        scanned
            .listed()
            .await
            .iter()
            .map(|series| series.is_adult)
            .collect::<Vec<_>>(),
        [true, false]
    );
}

#[tokio::test]
async fn counts_a_series_marked_by_hand_even_while_age_ratings_stop_counting() {
    let scanned = Scanned::with(
        "detail-edits-adult-uncounted",
        &[
            (SERIES_01, PLAIN),
            (SERIES_02, RATED_18),
            (SERIES_03, PLAIN),
        ],
    )
    .await;
    let marked = scanned.series_named(SERIES_01).await;
    scanned
        .library
        .edit_series_details(
            marked,
            DetailEdits {
                is_marked_adult: true,
                ..nothing_edited()
            },
        )
        .await
        .unwrap();
    scanned
        .library
        .set_adult_content(AdultContent {
            treatment: AdultTreatment::Hide,
            counts_age_ratings: false,
        })
        .await
        .unwrap();

    let listed = scanned.listed().await;

    assert_eq!(
        listed
            .iter()
            .map(|series| (series.title.as_str(), series.is_adult))
            .collect::<Vec<_>>(),
        [(SERIES_01, true), (SERIES_02, false), (SERIES_03, false)]
    );
    assert_eq!(
        scanned.titles(with_adult(Inclusion::Only)).await,
        [SERIES_01]
    );
    assert_eq!(
        scanned.titles(with_adult(Inclusion::Hide)).await,
        [SERIES_02, SERIES_03]
    );
    assert!(scanned.library.filter_choices().await.unwrap().rates_adult);
    let other = scanned.series_named(SERIES_03).await;
    let related = scanned
        .library
        .series_overview(other)
        .await
        .unwrap()
        .related;
    assert_eq!(
        related
            .iter()
            .map(|series| series.title.as_str())
            .collect::<Vec<_>>(),
        [SERIES_02]
    );
}

#[tokio::test]
async fn leaves_a_series_marked_by_hand_out_of_the_related_series_while_adult_series_are_hidden() {
    let scanned = Scanned::with(
        "detail-edits-related-adult",
        &[(SERIES_01, PLAIN), (SERIES_02, PLAIN)],
    )
    .await;
    let marked = scanned.series_named(SERIES_01).await;
    let other = scanned.series_named(SERIES_02).await;
    scanned
        .library
        .edit_series_details(
            marked,
            DetailEdits {
                is_marked_adult: true,
                ..nothing_edited()
            },
        )
        .await
        .unwrap();
    let related_titles = || async {
        scanned
            .library
            .series_overview(other)
            .await
            .unwrap()
            .related
            .into_iter()
            .map(|related| related.title)
            .collect::<Vec<_>>()
    };

    let shown = related_titles().await;
    scanned
        .library
        .set_adult_content(AdultContent {
            treatment: AdultTreatment::Hide,
            ..AdultContent::default()
        })
        .await
        .unwrap();

    assert_eq!(shown, [SERIES_01]);
    assert_eq!(related_titles().await, Vec::<String>::new());
}

#[tokio::test]
async fn keeps_the_edits_through_a_rescan_that_changes_the_files() {
    let scanned = two_series("detail-edits-rescan").await;
    let series = scanned.series_named(SERIES_01).await;
    scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                title: Some("Edited Title".to_owned()),
                tags: Some(vec!["lanterns".to_owned()]),
                ..nothing_edited()
            },
        )
        .await
        .unwrap();
    let book = scanned.comics.path().join(SERIES_01).join("v09.cbz");
    write_book_with(
        &book,
        9,
        Some("<ComicInfo><Tags>harbour</Tags></ComicInfo>"),
    );

    scanned.library.rescan_folders().await.unwrap();

    let details = scanned.library.series_details(series).await.unwrap();
    assert_eq!(details.title.edited.as_deref(), Some("Edited Title"));
    assert_eq!(details.tags.edited, Some(vec!["lanterns".to_owned()]));
    assert!(
        scanned
            .titles(LibraryListing::default())
            .await
            .contains(&"Edited Title".to_owned())
    );
}

#[tokio::test]
async fn says_a_series_it_does_not_hold_is_not_in_the_library() {
    let scanned = two_series("detail-edits-missing").await;
    let elsewhere = SeriesId::try_from("0190a3e4-0000-8000-8000-00000000ffff".to_owned()).unwrap();

    let edited = scanned
        .library
        .edit_series_details(elsewhere, nothing_edited())
        .await;

    assert!(matches!(edited, Err(LibraryError::SeriesNotFound { .. })));
}
