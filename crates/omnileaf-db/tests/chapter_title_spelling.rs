#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock, book ids and open helper"
)]
mod store_support;
mod support;

use std::path::PathBuf;

use omnileaf_db::{
    adult_content::AdultHiding,
    catalog::{
        AgeRating, BookDetails, BookFile, ChapterSuggestion, NewRoot, NewSeries, RootId, RootKind,
        RootLocator, ScannedBook, add_root, closest_chapter_title, mark_root_unavailable,
        record_scanned_books,
    },
    store::{SeriesEdits, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const SERIES: &str = "Sample Series 01";
const ANOTHER_SERIES: &str = "Sample Series 02";
const HIDDEN_SERIES: &str = "Hidden Imprint";
const MARKED_SERIES: &str = "Marked Imprint";
const LOST_SERIES: &str = "Lost Imprint";
const PAGES_PER_BOOK: u32 = 10;
const MORE_BOOKS_THAN_THE_WINDOW_HOLDS: u32 = 300;
const HIDING: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: true,
};
const HIDING_ONLY_MARKS: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: false,
};

struct SampleBook<'a> {
    number: u32,
    series: &'a str,
    title: String,
    comic_info_title: Option<&'a str>,
    age_rating: Option<AgeRating>,
}

impl<'a> SampleBook<'a> {
    fn titled(number: u32, title: &str) -> Self {
        Self {
            number,
            series: SERIES,
            title: title.to_owned(),
            comic_info_title: None,
            age_rating: None,
        }
    }

    fn in_series(self, series: &'a str) -> Self {
        Self { series, ..self }
    }

    fn with_comic_info_title(self, title: &'a str) -> Self {
        Self {
            comic_info_title: Some(title),
            ..self
        }
    }

    fn rated_18(self) -> Self {
        Self {
            age_rating: Some(AgeRating::AdultsOnly18),
            ..self
        }
    }
}

struct Library {
    store: Store,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let root = add_root_at(&store, "/media/Comics").await;
        Self {
            store,
            root,
            _folder: folder,
        }
    }

    async fn record(&self, sample: SampleBook<'_>) -> BookId {
        self.record_in(self.root, sample).await
    }

    async fn record_in(&self, root: RootId, sample: SampleBook<'_>) -> BookId {
        let number = sample.number;
        self.record_all(root, vec![sample]).await;
        book(number)
    }

    async fn record_all(&self, root: RootId, samples: Vec<SampleBook<'_>>) {
        let scanned: Vec<ScannedBook> = samples
            .into_iter()
            .map(|sample| scanned_book(root, sample))
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn mark_adult(&self, series: &str) {
        let series = NewSeries::local(series, ADDED_AT_MS).unwrap().id();
        let marked = SeriesEdits {
            is_adult: true,
            ..SeriesEdits::default()
        };
        self.store
            .write(move |writer| writer.edit_series(series, marked))
            .await
            .unwrap();
    }

    async fn suggestion(&self, text: &str) -> Option<ChapterSuggestion> {
        self.suggestion_while(text, AdultHiding::default()).await
    }

    async fn suggestion_while(&self, text: &str, hiding: AdultHiding) -> Option<ChapterSuggestion> {
        let text = text.to_owned();
        self.store
            .database()
            .read(move |connection| closest_chapter_title(connection, &text, hiding))
            .await
            .unwrap()
    }
}

async fn add_root_at(store: &Store, location: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(location)),
        added_at_ms: ADDED_AT_MS,
    };
    store
        .database()
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

fn scanned_book(root: RootId, sample: SampleBook<'_>) -> ScannedBook {
    ScannedBook {
        series: NewSeries::local(sample.series, ADDED_AT_MS).unwrap(),
        named_series: None,
        fingerprint: fingerprint_of(sample.number),
        title: sample.title,
        added_at_ms: ADDED_AT_MS,
        page_count: PAGES_PER_BOOK,
        details: BookDetails {
            title: sample.comic_info_title.map(str::to_owned),
            age_rating: sample.age_rating,
            ..BookDetails::default()
        },
        file: BookFile {
            root,
            location: format!("{}/{}.cbz", sample.series, sample.number).into(),
            size_bytes: 100,
            modified_at_ms: ADDED_AT_MS,
        },
        numbering: None,
        name_language: None,
    }
}

fn fingerprint_of(number: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: number,
        size: 1,
    }])
    .unwrap()
}

fn suggested(chapter_words: &str, series_title: &str) -> ChapterSuggestion {
    ChapterSuggestion {
        chapter_words: chapter_words.to_owned(),
        series_title: series_title.to_owned(),
    }
}

#[tokio::test]
async fn suggests_the_closest_words_of_a_comic_info_title_and_the_series_holding_it() {
    let library = Library::open("chapter-spelling-comic-info").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Harbor Gate 5"))
        .await;
    library
        .record(SampleBook::titled(2, "Volume 02").in_series(ANOTHER_SERIES))
        .await;

    let suggestion = library.suggestion("harbr gate 5").await;

    assert_eq!(suggestion, Some(suggested("harbor gate 5", SERIES)));
}

#[tokio::test]
async fn suggests_the_closest_words_of_a_file_name_title_and_the_series_holding_it() {
    let library = Library::open("chapter-spelling-file-name").await;
    library.record(SampleBook::titled(1, "Volume 01")).await;
    library
        .record(SampleBook::titled(2, "Chapter 12").in_series(ANOTHER_SERIES))
        .await;

    let suggestion = library.suggestion("chaptr 12").await;

    assert_eq!(suggestion, Some(suggested("chapter 12", ANOTHER_SERIES)));
}

#[tokio::test]
async fn suggests_the_run_of_words_nearest_the_typed_ones_in_a_longer_title() {
    let library = Library::open("chapter-spelling-nearest-run").await;
    library
        .record(SampleBook::titled(1, "Chapter 12").with_comic_info_title("The Lantern Keeper"))
        .await;

    let suggestion = library.suggestion("lantren keper").await;

    assert_eq!(suggestion, Some(suggested("lantern keeper", SERIES)));
}

#[tokio::test]
async fn suggests_nothing_for_text_that_already_matches_a_chapter_title() {
    let library = Library::open("chapter-spelling-already-matches").await;
    library.record(SampleBook::titled(1, "Chapter 12")).await;

    let suggestions = (
        library.suggestion("chaptr 12").await,
        library.suggestion("chapter 12").await,
    );

    assert_eq!(suggestions, (Some(suggested("chapter 12", SERIES)), None));
}

#[tokio::test]
async fn suggests_nothing_for_text_far_from_every_chapter_title() {
    let library = Library::open("chapter-spelling-far").await;
    library.record(SampleBook::titled(1, "Chapter 12")).await;

    let suggestions = (
        library.suggestion("chaptr 12").await,
        library.suggestion("quixotic").await,
    );

    assert_eq!(suggestions, (Some(suggested("chapter 12", SERIES)), None));
}

#[tokio::test]
async fn suggests_nothing_for_text_shorter_than_a_trigram() {
    let library = Library::open("chapter-spelling-short").await;
    library.record(SampleBook::titled(1, "Chapter 12")).await;

    let suggestions = (
        library.suggestion("chaptr").await,
        library.suggestion("ch").await,
        library.suggestion("").await,
    );

    assert_eq!(
        suggestions,
        (Some(suggested("chapter", SERIES)), None, None)
    );
}

#[tokio::test]
async fn suggests_no_chapter_of_a_series_of_a_missing_folder() {
    let library = Library::open("chapter-spelling-missing-folder").await;
    let lost = add_root_at(&library.store, "/media/Lost").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Lantern Keeper"))
        .await;
    library
        .record_in(
            lost,
            SampleBook::titled(2, "Volume 01")
                .in_series(LOST_SERIES)
                .with_comic_info_title("Harbor Gate"),
        )
        .await;
    library
        .store
        .database()
        .write(move |transaction| mark_root_unavailable(transaction, lost, ADDED_AT_MS))
        .await
        .unwrap();

    let suggestions = (
        library.suggestion("lantren keeper").await,
        library.suggestion("harbr gate").await,
    );

    assert_eq!(
        suggestions,
        (Some(suggested("lantern keeper", SERIES)), None)
    );
}

#[tokio::test]
async fn suggests_no_chapter_of_a_book_removed_from_the_library() {
    let library = Library::open("chapter-spelling-removed-book").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Lantern Keeper"))
        .await;
    let removed = library
        .record(
            SampleBook::titled(2, "Volume 02")
                .in_series(ANOTHER_SERIES)
                .with_comic_info_title("Harbor Gate"),
        )
        .await;
    library
        .record(SampleBook::titled(3, "Volume 03").in_series(ANOTHER_SERIES))
        .await;
    library
        .store
        .write(move |writer| writer.remove_books_from_library(&[removed]))
        .await
        .unwrap();

    let suggestions = (
        library.suggestion("lantren keeper").await,
        library.suggestion("harbr gate").await,
    );

    assert_eq!(
        suggestions,
        (Some(suggested("lantern keeper", SERIES)), None)
    );
}

#[tokio::test]
async fn suggests_no_chapter_of_a_series_left_without_books() {
    let library = Library::open("chapter-spelling-no-books").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Lantern Keeper"))
        .await;
    let only = library
        .record(
            SampleBook::titled(2, "Volume 02")
                .in_series(ANOTHER_SERIES)
                .with_comic_info_title("Harbor Gate"),
        )
        .await;
    library
        .store
        .write(move |writer| writer.remove_books_from_library(&[only]))
        .await
        .unwrap();

    let suggestions = (
        library.suggestion("lantren keeper").await,
        library.suggestion("harbr gate").await,
    );

    assert_eq!(
        suggestions,
        (Some(suggested("lantern keeper", SERIES)), None)
    );
}

#[tokio::test]
async fn suggests_no_chapter_of_an_18_plus_series_while_hiding() {
    let library = Library::open("chapter-spelling-hiding").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Lantern Keeper"))
        .await;
    library
        .record(
            SampleBook::titled(2, "Volume 01")
                .in_series(HIDDEN_SERIES)
                .with_comic_info_title("Forbidden Tale")
                .rated_18(),
        )
        .await;

    let hidden_text = (
        library.suggestion("forbiden tale").await,
        library.suggestion_while("forbiden tale", HIDING).await,
        library
            .suggestion_while("forbiden tale", HIDING_ONLY_MARKS)
            .await,
    );
    let shown_text = (
        library.suggestion("lantren keeper").await,
        library.suggestion_while("lantren keeper", HIDING).await,
        library
            .suggestion_while("lantren keeper", HIDING_ONLY_MARKS)
            .await,
    );

    assert_eq!(
        (hidden_text, shown_text),
        (
            (
                Some(suggested("forbidden tale", HIDDEN_SERIES)),
                None,
                Some(suggested("forbidden tale", HIDDEN_SERIES))
            ),
            (
                Some(suggested("lantern keeper", SERIES)),
                Some(suggested("lantern keeper", SERIES)),
                Some(suggested("lantern keeper", SERIES))
            )
        )
    );
}

#[tokio::test]
async fn suggests_no_chapter_of_a_series_marked_adult_while_hiding() {
    let library = Library::open("chapter-spelling-marked").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("Lantern Keeper"))
        .await;
    library
        .record(
            SampleBook::titled(2, "Volume 01")
                .in_series(MARKED_SERIES)
                .with_comic_info_title("Forbidden Tale"),
        )
        .await;
    library.mark_adult(MARKED_SERIES).await;

    let suggestions = (
        library.suggestion("forbiden tale").await,
        library.suggestion_while("forbiden tale", HIDING).await,
        library
            .suggestion_while("forbiden tale", HIDING_ONLY_MARKS)
            .await,
    );

    assert_eq!(
        suggestions,
        (Some(suggested("forbidden tale", MARKED_SERIES)), None, None)
    );
}

#[tokio::test]
async fn suggests_a_visible_chapter_although_its_rarest_trigrams_are_in_a_hidden_series_only() {
    let library = Library::open("chapter-spelling-hidden-rarest").await;
    for number in 1..=5 {
        library
            .record(
                SampleBook::titled(number, "Volume 01")
                    .with_comic_info_title(&format!("Lantern Keeper {number}")),
            )
            .await;
    }
    library
        .record(
            SampleBook::titled(6, "Volume 01")
                .in_series(HIDDEN_SERIES)
                .with_comic_info_title("Lantren Keeper Redux")
                .rated_18(),
        )
        .await;

    let suggestion = library.suggestion_while("lantren keeper", HIDING).await;

    assert_eq!(
        suggestion.map(|found| found.series_title),
        Some(SERIES.to_owned())
    );
}

#[tokio::test]
async fn suggests_a_word_found_in_more_titles_than_the_candidate_window_holds() {
    let library = Library::open("chapter-spelling-common-word").await;
    let samples = (1..=MORE_BOOKS_THAN_THE_WINDOW_HOLDS)
        .map(|number| SampleBook::titled(number, &format!("Volume {number:03}")))
        .collect();
    library.record_all(library.root, samples).await;

    let suggestion = library.suggestion("volmue").await;

    assert_eq!(suggestion, Some(suggested("volume", SERIES)));
}

#[tokio::test]
async fn suggests_a_distinctive_title_although_a_common_trigram_matches_more_titles_than_the_window_holds()
 {
    let library = Library::open("chapter-spelling-distinctive").await;
    let mut samples: Vec<SampleBook<'_>> = (1..=MORE_BOOKS_THAN_THE_WINDOW_HOLDS)
        .map(|number| SampleBook::titled(number, &format!("Harbor Light {number:03}")))
        .collect();
    samples.push(SampleBook::titled(
        MORE_BOOKS_THAN_THE_WINDOW_HOLDS + 1,
        "Harbor Gate",
    ));
    library.record_all(library.root, samples).await;

    let suggestion = library.suggestion("harbr gate").await;

    assert_eq!(suggestion, Some(suggested("harbor gate", SERIES)));
}
