#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with ComicInfo, so the other kinds of book go unused"
)]
mod books;
#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the other support files"
)]
mod support;

use std::fs;

use books::write_book_with;
use omnileaf_engine::{
    AdultContent, AdultTreatment, ChapterCursor, ChapterHit, ChapterHitPage, ChapterTitleSource,
    Inclusion, Library, LibraryError, LibraryFilter, LibraryListing, LibrarySearch, ReadMark,
    SeriesFormat, SpellingSuggestion,
};
use support::{FixedClock, ScratchFolder};

const LANTERNS: &str = "Lantern Keepers";
const HARBOUR: &str = "Harbour Gate";
const FORBIDDEN: &str = "Forbidden Tale";
const LONG_RUN: &str = "Long Run";
const MANGA: &str = "<ComicInfo><Manga>Yes</Manga></ComicInfo>";
const RETITLED: &str = "<ComicInfo><Title>Brightwater Ferry</Title></ComicInfo>";
const FERRY: &str = "<ComicInfo><Title>Crossing Tales</Title></ComicInfo>";
const RATED_18: &str = "<ComicInfo><AgeRating>R18+</AgeRating></ComicInfo>";
const LONG_RUN_BOOKS: u32 = 25;
const CHAPTERS_PER_PAGE: usize = 20;
const SERIES_ON_A_PAGE: u32 = 50;

struct Shelf {
    library: Library,
    comics: ScratchFolder,
    _home: ScratchFolder,
}

impl Shelf {
    async fn scanned(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let books = [
            (LANTERNS, "Chapter 01 Dawn", Some(MANGA)),
            (LANTERNS, "Chapter 02 Dusk", Some(MANGA)),
            (LANTERNS, "Chapter 03 Harbour Gate", Some(MANGA)),
            (HARBOUR, "Chapter 01 Tide", Some(RETITLED)),
            (HARBOUR, "Chapter 04 Ferry Crossing", Some(FERRY)),
            (FORBIDDEN, "Chapter 01 Moonlit", Some(RATED_18)),
        ];
        for (seed, (series, title, comic_info)) in (1..).zip(books) {
            write_book_with(
                &comics.path().join(series).join(format!("{title}.cbz")),
                seed,
                comic_info,
            );
        }
        Self::open(name, comics).await
    }

    async fn open(name: &str, comics: ScratchFolder) -> Self {
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

    async fn long_run(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        for number in 1..=LONG_RUN_BOOKS {
            write_book_with(
                &comics
                    .path()
                    .join(LONG_RUN)
                    .join(format!("Stage {number:02}.cbz")),
                u64::from(number),
                None,
            );
        }
        Self::open(name, comics).await
    }

    async fn many_series(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        for number in 1..=SERIES_ON_A_PAGE + 1 {
            write_book_with(
                &comics
                    .path()
                    .join(format!("Shelf Series {number:02}"))
                    .join("v01.cbz"),
                u64::from(number),
                None,
            );
        }
        Self::open(name, comics).await
    }

    async fn finished(&self, series: &str) {
        let books = self
            .chapters("chapter")
            .await
            .hits
            .into_iter()
            .filter(|hit| hit.series_title == series)
            .map(|hit| hit.book)
            .collect();
        self.library
            .mark_books(books, ReadMark::Read)
            .await
            .unwrap();
    }

    async fn lost_the_lantern_books(&self) {
        for title in [
            "Chapter 01 Dawn",
            "Chapter 02 Dusk",
            "Chapter 03 Harbour Gate",
        ] {
            fs::remove_file(
                self.comics
                    .path()
                    .join(LANTERNS)
                    .join(format!("{title}.cbz")),
            )
            .unwrap();
        }
        let folder = self
            .library
            .folders(None)
            .await
            .unwrap()
            .folders
            .last()
            .unwrap()
            .id;
        self.library.rescan_folder(folder, |_| {}).await.unwrap();
    }

    async fn chapters(&self, text: &str) -> ChapterHitPage {
        self.chapters_through(text, every_series()).await
    }

    async fn chapters_through(&self, text: &str, filter: LibraryFilter) -> ChapterHitPage {
        self.library
            .search_chapters(search(text, filter), None)
            .await
            .unwrap()
    }
}

fn every_series() -> LibraryFilter {
    LibraryListing::default().filter
}

fn search(text: &str, filter: LibraryFilter) -> LibrarySearch {
    LibrarySearch {
        text: text.to_owned(),
        filter,
    }
}

fn seen(page: &ChapterHitPage) -> Vec<(&str, u32, &str, ChapterTitleSource)> {
    let mut hits: Vec<_> = page
        .hits
        .iter()
        .map(|hit| {
            (
                hit.series_title.as_str(),
                hit.position,
                hit.title.as_str(),
                hit.matched_in,
            )
        })
        .collect();
    hits.sort_by_key(|hit| (hit.0, hit.1));
    hits
}

#[tokio::test]
async fn finds_the_books_whose_file_name_holds_the_text() {
    let shelf = Shelf::scanned("chapter-file-name").await;

    let page = shelf.chapters("dusk").await;

    assert_eq!(
        (seen(&page), page.next.as_ref(), page.count),
        (
            vec![(LANTERNS, 2, "Chapter 02 Dusk", ChapterTitleSource::FileName)],
            None,
            Some(1)
        )
    );
}

#[tokio::test]
async fn finds_the_books_whose_comic_info_title_holds_the_text() {
    let shelf = Shelf::scanned("chapter-comic-info").await;

    let pages = [
        shelf.chapters("brightwater").await,
        shelf.chapters("tide").await,
    ];

    assert_eq!(
        pages.iter().map(seen).collect::<Vec<_>>(),
        [
            vec![(
                HARBOUR,
                1,
                "Brightwater Ferry",
                ChapterTitleSource::ComicInfo
            )],
            vec![(HARBOUR, 1, "Chapter 01 Tide", ChapterTitleSource::FileName)],
        ]
    );
}

#[tokio::test]
async fn hands_back_an_empty_page_for_blank_text_and_text_under_three_characters() {
    let shelf = Shelf::scanned("chapter-short-text").await;
    let mut pages = Vec::new();

    for text in ["", "   ", "c", "ch"] {
        pages.push(shelf.chapters(text).await);
    }

    assert!(
        pages
            .iter()
            .all(|page| page.hits.is_empty() && page.next.is_none() && page.count == Some(0)),
        "{pages:?}"
    );
}

#[tokio::test]
async fn refuses_text_longer_than_a_search_reads_as_a_search_too_long() {
    let shelf = Shelf::scanned("chapter-too-long").await;
    let too_long = "s".repeat(usize::from(LibrarySearch::MAX_CHARS) + 1);

    let refusal = shelf
        .library
        .search_chapters(search(&too_long, every_series()), None)
        .await;

    assert!(
        matches!(refusal, Err(LibraryError::SearchTooLong { .. })),
        "{refusal:?}"
    );
}

#[tokio::test]
async fn finds_only_the_books_of_series_the_filter_lets_through() {
    let shelf = Shelf::scanned("chapter-filter").await;
    shelf.finished(LANTERNS).await;
    let only_finished = LibraryFilter {
        finished: Inclusion::Only,
        ..every_series()
    };
    let only_started = LibraryFilter {
        started: Inclusion::Only,
        ..every_series()
    };

    let pages = [
        shelf.chapters_through("dawn", only_finished.clone()).await,
        shelf.chapters_through("tide", only_finished).await,
        shelf.chapters_through("dawn", only_started).await,
    ];

    assert_eq!(
        pages
            .iter()
            .map(|page| (page.hits.len(), page.count))
            .collect::<Vec<_>>(),
        [(1, Some(1)), (0, Some(0)), (1, Some(1))]
    );
}

#[tokio::test]
async fn narrows_the_books_to_the_series_of_the_chosen_format() {
    let shelf = Shelf::scanned("chapter-formats").await;
    let mut series_by_format = Vec::new();

    for format in [SeriesFormat::Manga, SeriesFormat::Comic, SeriesFormat::Book] {
        let formats = LibraryFilter {
            formats: vec![format],
            ..every_series()
        };
        let page = shelf.chapters_through("chapter 01", formats).await;
        series_by_format.push((
            seen(&page)
                .iter()
                .map(|hit| hit.0.to_owned())
                .collect::<Vec<_>>(),
            page.count,
        ));
    }

    assert_eq!(
        series_by_format,
        [
            (vec![LANTERNS.to_owned()], Some(1)),
            (vec![FORBIDDEN.to_owned(), HARBOUR.to_owned()], Some(2)),
            (vec![], Some(0)),
        ]
    );
}

#[tokio::test]
async fn finds_series_by_text_only_in_the_format_chosen_and_none_for_the_book_format() {
    let shelf = Shelf::scanned("series-formats").await;
    let mut series_by_format = Vec::new();

    for format in [SeriesFormat::Manga, SeriesFormat::Comic, SeriesFormat::Book] {
        let mut found = Vec::new();
        for text in ["keepers", "tale"] {
            let formats = LibraryFilter {
                formats: vec![format],
                ..every_series()
            };
            let page = shelf
                .library
                .search(search(text, formats), None)
                .await
                .unwrap();
            found.extend(page.series.into_iter().map(|series| series.title));
        }
        series_by_format.push(found);
    }

    assert_eq!(
        series_by_format,
        [
            vec![LANTERNS.to_owned()],
            vec![FORBIDDEN.to_owned()],
            Vec::new(),
        ]
    );
}

#[tokio::test]
async fn pages_through_the_hits_with_a_cursor_that_survives_the_trip_to_the_interface() {
    let shelf = Shelf::long_run("chapter-paging").await;

    let first = shelf.chapters("stage").await;
    let handed_back = ChapterCursor::try_from(String::from(first.next.clone().unwrap())).unwrap();
    let second = shelf
        .library
        .search_chapters(search("stage", every_series()), Some(handed_back))
        .await
        .unwrap();

    let mut positions: Vec<u32> = first
        .hits
        .iter()
        .chain(&second.hits)
        .map(|hit| hit.position)
        .collect();
    positions.sort_unstable();
    assert_eq!(
        (
            first.hits.len(),
            first.count,
            second.hits.len(),
            second.next,
            positions,
        ),
        (
            CHAPTERS_PER_PAGE,
            Some(LONG_RUN_BOOKS),
            usize::try_from(LONG_RUN_BOOKS).unwrap() - CHAPTERS_PER_PAGE,
            None,
            (1..=LONG_RUN_BOOKS).collect(),
        )
    );
}

#[tokio::test]
async fn names_the_series_book_and_position_of_each_hit() {
    let shelf = Shelf::scanned("chapter-ids").await;

    let page = shelf.chapters("moonlit").await;
    let hit: &ChapterHit = &page.hits[0];

    let series = shelf
        .library
        .series_overview(hit.series)
        .await
        .unwrap()
        .title;
    assert_eq!((series.as_str(), hit.position), (FORBIDDEN, 1));
}

#[tokio::test]
async fn leaves_18_plus_series_out_of_the_hits_count_and_cursor_while_screenshot_mode_is_on() {
    let shelf = Shelf::scanned("chapter-screenshot").await;
    let before = shelf.chapters("moonlit").await;

    shelf.library.set_screenshot_mode(true);
    let after = [
        shelf.chapters("moonlit").await,
        shelf.chapters("chapter 01").await,
    ];

    assert_eq!(before.hits.len(), 1);
    assert_eq!(
        after
            .iter()
            .map(|page| (seen(page).len(), page.next.is_some(), page.count))
            .collect::<Vec<_>>(),
        [(0, false, Some(0)), (2, false, Some(2))]
    );
}

#[tokio::test]
async fn leaves_out_the_series_the_filter_hides_as_18_plus() {
    let shelf = Shelf::scanned("chapter-adult-filter").await;
    let hiding_adult = LibraryFilter {
        adult: Inclusion::Hide,
        ..every_series()
    };

    let pages = [
        shelf
            .chapters_through("moonlit", hiding_adult.clone())
            .await,
        shelf.chapters_through("chapter 01", hiding_adult).await,
    ];

    assert_eq!(
        pages
            .iter()
            .map(|page| (seen(page).len(), page.count))
            .collect::<Vec<_>>(),
        [(0, Some(0)), (2, Some(2))]
    );
}

#[tokio::test]
async fn finds_nothing_in_a_series_that_lost_all_its_books() {
    let shelf = Shelf::scanned("chapter-no-books").await;
    let before = shelf.chapters("dawn").await;
    shelf.lost_the_lantern_books().await;

    let pages = [shelf.chapters("dawn").await, shelf.chapters("dusk").await];

    assert_eq!(before.hits.len(), 1);
    assert!(
        pages
            .iter()
            .all(|page| page.hits.is_empty() && page.next.is_none() && page.count == Some(0)),
        "{pages:?}"
    );
}

fn suggestion(text: &str, chapter_of: Option<&str>) -> SpellingSuggestion {
    SpellingSuggestion {
        text: text.to_owned(),
        chapter_of: chapter_of.map(ToOwned::to_owned),
    }
}

async fn suggested(shelf: &Shelf, text: &str) -> Option<SpellingSuggestion> {
    shelf
        .library
        .spelling_suggestion(text.to_owned())
        .await
        .unwrap()
}

#[tokio::test]
async fn suggests_the_closest_words_of_a_chapter_title_with_the_series_holding_it() {
    let shelf = Shelf::scanned("chapter-spelling").await;

    let found = suggested(&shelf, "brigthwater").await;

    assert_eq!(found, Some(suggestion("brightwater", Some(HARBOUR))));
}

#[tokio::test]
async fn suggests_the_title_of_a_series_before_the_title_of_a_chapter() {
    let shelf = Shelf::scanned("chapter-spelling-series-first").await;

    let found = suggested(&shelf, "harbor gate").await;

    assert_eq!(found, Some(suggestion("harbour gate", None)));
}

#[tokio::test]
async fn names_no_series_for_a_chapter_title_while_screenshot_mode_is_on() {
    let shelf = Shelf::scanned("chapter-spelling-screenshot").await;
    shelf.library.set_screenshot_mode(true);

    let found = suggested(&shelf, "brigthwater").await;

    assert_eq!(found, Some(suggestion("brightwater", None)));
}

#[tokio::test]
async fn suggests_no_chapter_title_of_a_18_plus_series_while_screenshot_mode_is_on() {
    let shelf = Shelf::scanned("chapter-spelling-adult").await;
    let before = suggested(&shelf, "moonlitt").await;

    shelf.library.set_screenshot_mode(true);
    let after = suggested(&shelf, "moonlitt").await;

    assert_eq!(
        (before, after),
        (Some(suggestion("moonlit", Some(FORBIDDEN))), None)
    );
}

#[tokio::test]
async fn suggests_no_chapter_title_of_a_series_that_lost_all_its_books() {
    let shelf = Shelf::scanned("chapter-spelling-no-books").await;
    let before = suggested(&shelf, "dawm").await;
    shelf.lost_the_lantern_books().await;

    let after = suggested(&shelf, "dawm").await;

    assert_eq!(
        (before, after),
        (Some(suggestion("dawn", Some(LANTERNS))), None)
    );
}

fn adult_content(treatment: AdultTreatment) -> AdultContent {
    AdultContent {
        treatment,
        counts_age_ratings: true,
    }
}

#[tokio::test]
async fn suggests_no_chapter_title_of_a_18_plus_series_the_library_hides() {
    let shelf = Shelf::scanned("chapter-spelling-hidden").await;
    shelf
        .library
        .set_adult_content(adult_content(AdultTreatment::Show))
        .await
        .unwrap();
    let shown = suggested(&shelf, "moonlitt").await;

    shelf
        .library
        .set_adult_content(adult_content(AdultTreatment::Hide))
        .await
        .unwrap();
    let hidden = suggested(&shelf, "moonlitt").await;

    assert_eq!(
        (shown, hidden),
        (Some(suggestion("moonlit", Some(FORBIDDEN))), None)
    );
}

#[tokio::test]
async fn finds_a_book_once_when_its_file_name_and_its_comic_info_title_both_hold_the_text() {
    let shelf = Shelf::scanned("chapter-both-titles").await;

    let page = shelf.chapters("crossing").await;

    assert_eq!(
        (seen(&page), page.count),
        (
            vec![(HARBOUR, 2, "Crossing Tales", ChapterTitleSource::ComicInfo)],
            Some(1)
        )
    );
}

#[tokio::test]
async fn finds_nothing_in_a_series_whose_folder_went_missing_and_nothing_to_suggest() {
    let shelf = Shelf::scanned("chapter-missing-folder").await;
    let before = (
        shelf.chapters("dawn").await.hits.len(),
        suggested(&shelf, "dawm").await,
    );
    let moved = shelf.comics.path().with_extension("moved");
    fs::rename(shelf.comics.path(), &moved).unwrap();
    let folder = shelf
        .library
        .folders(None)
        .await
        .unwrap()
        .folders
        .last()
        .unwrap()
        .id;
    shelf.library.rescan_folder(folder, |_| {}).await.unwrap();

    let after = shelf.chapters("dawn").await;
    let suggestion_after = suggested(&shelf, "dawm").await;

    fs::rename(moved, shelf.comics.path()).unwrap();
    assert_eq!(before, (1, Some(suggestion("dawn", Some(LANTERNS)))));
    assert_eq!(
        (after.hits.len(), after.next, after.count, suggestion_after),
        (0, None, Some(0), None)
    );
}

#[tokio::test]
async fn refuses_a_cursor_given_out_for_a_list_of_series() {
    let shelf = Shelf::many_series("chapter-series-cursor").await;
    let series = shelf
        .library
        .search(search("shelf", every_series()), None)
        .await
        .unwrap();
    let series_cursor = String::from(series.next.unwrap());

    let refusal = shelf
        .library
        .search_chapters(
            search("shelf", every_series()),
            Some(ChapterCursor::try_from(series_cursor).unwrap()),
        )
        .await;

    assert!(
        matches!(refusal, Err(LibraryError::CursorForAnotherList)),
        "{refusal:?}"
    );
}

#[tokio::test]
async fn refuses_a_cursor_string_that_is_not_one_the_library_gave_out() {
    let shelf = Shelf::long_run("chapter-tampered-cursor").await;
    let given = String::from(shelf.chapters("stage").await.next.unwrap());
    let cut_short = given[..given.len() - 1].to_owned();
    let run_long = format!("{given}0");

    let refusals = [String::new(), "tampered".to_owned(), cut_short, run_long]
        .map(|text| ChapterCursor::try_from(text).err());

    assert!(
        refusals
            .iter()
            .all(|refusal| matches!(refusal, Some(omnileaf_db::Error::MalformedCursor))),
        "{refusals:?}"
    );
}
