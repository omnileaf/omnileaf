#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    Database,
    catalog::{
        Cursor, Inclusion, PageRequest, PageSize, SearchText, SeriesFilter, SeriesSearch,
        search_count, search_page,
    },
    store::{Clock, Store},
};
use omnileaf_sync_proto::BookId;
use support::{ScratchFolder, library_config};

const VOLUME_ONE: &str = "Volume 01";
const NO_BOOKS: &[&str] = &[];
const WHOLE_LIBRARY: u16 = 50;

const SHELF: [SeriesSeed<'static>; 7] = [
    SeriesSeed::named("Market Lanterns"),
    SeriesSeed::named("Harbour Gate"),
    SeriesSeed::named("Lantern Market"),
    SeriesSeed::named("Écho du Port"),
    SeriesSeed::named("100% Sample"),
    SeriesSeed::named("Sample_Series"),
    SeriesSeed {
        book_titles: NO_BOOKS,
        ..SeriesSeed::named("Lantern Market Annex")
    },
];

struct StoppedClock;

impl Clock for StoppedClock {
    fn now_unix_ms(&self) -> u64 {
        0
    }
}

struct Library {
    store: Store,
    _folder: ScratchFolder,
}

impl Library {
    async fn with(name: &str, series: &[SeriesSeed<'_>]) -> Self {
        let folder = ScratchFolder::new(name);
        let store = Store::new(
            Database::open(&library_config(&folder)).unwrap(),
            StoppedClock,
        );
        seed_library(store.database(), series).await;
        Self {
            store,
            _folder: folder,
        }
    }

    async fn finding(&self, text: &str) -> Vec<String> {
        self.pages(&search(text, SeriesFilter::NONE), WHOLE_LIBRARY)
            .await
            .concat()
    }

    /// Passes every cursor through its text form, as one crossing to the interface would.
    async fn pages(&self, search: &SeriesSearch, size: u16) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut after: Option<Cursor> = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(size).unwrap(),
            };
            let search = search.clone();
            let page = self
                .store
                .database()
                .read(move |connection| search_page(connection, &search, &request))
                .await
                .unwrap();
            pages.push(page.items.into_iter().map(|series| series.title).collect());
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }

    async fn count(&self, search: SeriesSearch) -> u32 {
        self.store
            .database()
            .read(move |connection| search_count(connection, &search))
            .await
            .unwrap()
    }

    async fn mark_read(&self, series: &'static str) {
        let book = BookId::local(&fingerprint(series, VOLUME_ONE));
        self.store
            .write(move |writer| writer.set_read(book, true))
            .await
            .unwrap();
    }
}

fn search(text: &str, filter: SeriesFilter) -> SeriesSearch {
    SeriesSearch {
        text: SearchText::parse(text).unwrap().unwrap(),
        filter,
    }
}

const fn finished(inclusion: Inclusion) -> SeriesFilter {
    SeriesFilter {
        finished: inclusion,
        ..SeriesFilter::NONE
    }
}

#[tokio::test]
async fn finds_the_series_holding_every_word_in_title_order() {
    let library = Library::with("every-word", &SHELF).await;

    let found = library.finding("market lantern").await;

    assert_eq!(found, ["Lantern Market", "Market Lanterns"]);
}

#[tokio::test]
async fn finds_a_word_whatever_its_letter_case() {
    let library = Library::with("letter-case", &SHELF).await;

    let found = [
        library.finding("HARBOUR").await,
        library.finding("écho").await,
    ];

    assert_eq!(found, [["Harbour Gate"], ["Écho du Port"]]);
}

#[tokio::test]
async fn finds_a_few_characters_anywhere_in_a_title() {
    let library = Library::with("few-characters", &SHELF).await;

    let found = library.finding("GA").await;

    assert_eq!(found, ["Harbour Gate"]);
}

#[tokio::test]
async fn finds_a_few_characters_whatever_their_letter_case_beyond_ascii() {
    let library = Library::with("few-characters-letter-case", &SHELF).await;

    let found = [library.finding("éc").await, library.finding("ÉC").await];

    assert_eq!(found, [["Écho du Port"], ["Écho du Port"]]);
}

/// A Greek title ending in a capital sigma, a German one with a sharp s, and one whose accent is a combining mark.
const FOLDED_SHELF: [SeriesSeed<'static>; 3] = [
    SeriesSeed::named("ΟΔΟΣ"),
    SeriesSeed::named("Straße"),
    SeriesSeed::named("Cafe\u{301} Noir"),
];

#[tokio::test]
async fn finds_a_few_characters_by_their_full_case_folding_and_composed_form() {
    let library = Library::with("few-characters-folded", &FOLDED_SHELF).await;

    let found = [
        library.finding("ος").await,
        library.finding("SS").await,
        library.finding("\u{e9}").await,
    ];

    assert_eq!(found, [["ΟΔΟΣ"], ["Straße"], ["Cafe\u{301} Noir"]]);
}

#[tokio::test]
async fn finds_wildcard_characters_only_where_a_title_holds_them() {
    let library = Library::with("wildcards", &SHELF).await;

    let found = [
        library.finding("%").await,
        library.finding("_").await,
        library.finding("0% s").await,
    ];

    assert_eq!(
        found,
        [
            vec!["100% Sample"],
            vec!["Sample_Series"],
            vec!["100% Sample"]
        ]
    );
}

#[tokio::test]
async fn finds_nothing_in_a_series_without_books() {
    let library = Library::with("no-books", &SHELF).await;

    let found = library.finding("annex").await;

    assert!(found.is_empty());
}

#[tokio::test]
async fn finds_only_the_series_the_filter_lets_through() {
    let library = Library::with("filtered", &SHELF).await;
    library.mark_read("Lantern Market").await;

    let found = [
        library
            .pages(&search("lantern", finished(Inclusion::Only)), WHOLE_LIBRARY)
            .await
            .concat(),
        library
            .pages(&search("lantern", finished(Inclusion::Hide)), WHOLE_LIBRARY)
            .await
            .concat(),
    ];

    assert_eq!(found, [["Lantern Market"], ["Market Lanterns"]]);
}

#[tokio::test]
async fn pages_through_what_a_search_finds_in_title_order() {
    let library = Library::with("search-pages", &SHELF).await;

    let pages = [
        library.pages(&search("a", SeriesFilter::NONE), 2).await,
        library.pages(&search("ar", SeriesFilter::NONE), 1).await,
    ];

    assert_eq!(
        pages,
        [
            vec![
                vec!["100% Sample", "Harbour Gate"],
                vec!["Lantern Market", "Market Lanterns"],
                vec!["Sample_Series"],
            ],
            vec![
                vec!["Harbour Gate"],
                vec!["Lantern Market"],
                vec!["Market Lanterns"],
            ],
        ]
    );
}

#[tokio::test]
async fn counts_what_a_search_finds_through_its_filter() {
    let library = Library::with("search-count", &SHELF).await;
    library.mark_read("Lantern Market").await;

    let counts = [
        library.count(search("lantern", SeriesFilter::NONE)).await,
        library
            .count(search("lantern", finished(Inclusion::Hide)))
            .await,
        library.count(search("ar", SeriesFilter::NONE)).await,
        library.count(search("ar", finished(Inclusion::Only))).await,
    ];

    assert_eq!(counts, [2, 1, 3, 1]);
}
