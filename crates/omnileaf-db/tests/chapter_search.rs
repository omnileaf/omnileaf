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

use std::{ops::Range, path::PathBuf};

use omnileaf_db::{
    Error,
    catalog::{
        AgeRating, BookDetails, BookFile, BookListing, CHAPTER_CANDIDATES_PER_CALL, ChapterHit,
        ChapterTitleSource, Cursor, Inclusion, NewRoot, NewSeries, PageRequest, PageSize, RootId,
        RootKind, RootLocator, ScannedBook, SearchText, SeriesFilter, SeriesFormat, SeriesSearch,
        add_root, add_series, mark_root_unavailable, record_scanned_books, search_chapters,
        search_chapters_count, search_page, series_books,
    },
    store::{SeriesEdits, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const MISSING_SINCE_MS: i64 = 1_790_000_000_000;
const PAGES_PER_BOOK: u32 = 10;
const WHOLE_LIBRARY: u16 = 200;
const LANTERNS: &str = "Lantern Keepers";
const HARBOUR: &str = "Harbour Gate";
const MARKET: &str = "Market Square";
const FORBIDDEN: &str = "Forbidden Tale";
const CROWD: &str = "Crowd";
const WANTED: &str = "wanted";
const TAGGED_EVERY: u32 = 20;
const WINDOW: u32 = CHAPTER_CANDIDATES_PER_CALL;

struct Chapter<'a> {
    number: u32,
    series: &'a str,
    title: &'a str,
    comic_info_title: Option<&'a str>,
    tags: Vec<String>,
    age_rating: Option<AgeRating>,
    is_manga: Option<bool>,
}

impl<'a> Chapter<'a> {
    fn titled(number: u32, series: &'a str, title: &'a str) -> Self {
        Self {
            number,
            series,
            title,
            comic_info_title: None,
            tags: Vec::new(),
            age_rating: None,
            is_manga: None,
        }
    }

    fn with_comic_info_title(self, title: &'a str) -> Self {
        Self {
            comic_info_title: Some(title),
            ..self
        }
    }

    fn tagged(self, tag: &str) -> Self {
        Self {
            tags: vec![tag.to_owned()],
            ..self
        }
    }

    fn rated_adult(self) -> Self {
        Self {
            age_rating: Some(AgeRating::AdultsOnly18),
            ..self
        }
    }

    fn manga(self, is_manga: bool) -> Self {
        Self {
            is_manga: Some(is_manga),
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
        let root = add_linked_root(&store, "/media/Comics").await;
        Self {
            store,
            root,
            _folder: folder,
        }
    }

    async fn record(&self, chapter: Chapter<'_>) -> BookId {
        self.record_in(self.root, chapter).await
    }

    async fn record_in(&self, root: RootId, chapter: Chapter<'_>) -> BookId {
        let number = chapter.number;
        let scanned = scanned_book(root, &chapter);
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        book(number)
    }

    async fn record_titled(&self, series: &str, numbers: Range<u32>, title_of: fn(u32) -> String) {
        let scanned: Vec<ScannedBook> = numbers
            .map(|number| {
                let title = title_of(number);
                scanned_book(self.root, &Chapter::titled(number, series, &title))
            })
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn record_adult_titled(&self, series: &str, numbers: Range<u32>) {
        let scanned: Vec<ScannedBook> = numbers
            .map(|number| {
                let title = volume_title(number);
                scanned_book(
                    self.root,
                    &Chapter::titled(number, series, &title).rated_adult(),
                )
            })
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn record_tagged(&self, series: &str, numbers: Range<u32>, tag: &str) {
        let scanned: Vec<ScannedBook> = numbers
            .map(|number| {
                let title = volume_title(number);
                scanned_book(
                    self.root,
                    &Chapter::titled(number, series, &title).tagged(tag),
                )
            })
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn record_one_in_twenty_tagged(&self, numbers: Range<u32>, title_of: fn(u32) -> String) {
        let scanned: Vec<ScannedBook> = numbers
            .map(|number| {
                let title = title_of(number);
                let chapter = if number % TAGGED_EVERY == 0 {
                    Chapter::titled(number, HARBOUR, &title).tagged(WANTED)
                } else {
                    Chapter::titled(number, CROWD, &title)
                };
                scanned_book(self.root, &chapter)
            })
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn record_titled_in_both_places(&self, series: &str, numbers: Range<u32>) {
        let titles: Vec<(u32, String)> = numbers
            .map(|number| (number, format!("Harbor Gate {number:04}")))
            .collect();
        let scanned: Vec<ScannedBook> = titles
            .iter()
            .map(|(number, title)| {
                scanned_book(
                    self.root,
                    &Chapter::titled(*number, series, title).with_comic_info_title("Harbor Gate"),
                )
            })
            .collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn index_ids_of(&self, book: BookId) -> Vec<(String, i64)> {
        self.store
            .database()
            .read(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT kind, id FROM book_title_search WHERE book_id = ?1 ORDER BY id",
                )?;
                statement
                    .query_map([book.as_bytes()], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<_, _>>()
                    .map_err(Error::from)
            })
            .await
            .unwrap()
    }

    async fn add_series_without_books(&self, title: &str) {
        let series = NewSeries::local(title, ADDED_AT_MS).unwrap();
        self.store
            .database()
            .write(move |transaction| add_series(transaction, &series))
            .await
            .unwrap();
    }

    async fn mark_adult(&self, series: &str) {
        let id = NewSeries::local(series, ADDED_AT_MS).unwrap().id();
        let edits = SeriesEdits {
            is_adult: true,
            ..SeriesEdits::default()
        };
        self.store
            .write(move |writer| writer.edit_series(id, edits))
            .await
            .unwrap();
    }

    async fn bookmark(&self, book: BookId) {
        self.store
            .database()
            .write(move |transaction| {
                transaction.execute(
                    "INSERT INTO book_bookmark (book_id, page) VALUES (?1, 1)",
                    [book.as_bytes()],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn page(&self, search: &SeriesSearch, after: Option<Cursor>, size: u16) -> Page {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        let search = search.clone();
        let page = self
            .store
            .database()
            .read(move |connection| search_chapters(connection, &search, &request))
            .await
            .unwrap();
        Page {
            hits: page.items,
            next: page.next.map(|next| next.to_string().parse().unwrap()),
        }
    }

    async fn pages(&self, search: &SeriesSearch, size: u16) -> Vec<Page> {
        let mut pages: Vec<Page> = Vec::new();
        let mut after: Option<Cursor> = None;
        loop {
            let page = self.page(search, after, size).await;
            let next = page.next.clone();
            pages.push(page);
            match next {
                Some(next) => after = Some(next),
                None => return pages,
            }
        }
    }

    async fn finding(&self, text: &str) -> Vec<(String, String, ChapterTitleSource)> {
        self.finding_through(text, SeriesFilter::NONE).await
    }

    async fn finding_through(
        &self,
        text: &str,
        filter: SeriesFilter,
    ) -> Vec<(String, String, ChapterTitleSource)> {
        self.pages(&search(text, filter), WHOLE_LIBRARY)
            .await
            .into_iter()
            .flat_map(|page| page.hits)
            .map(|hit| (hit.series_title, hit.title, hit.matched_in))
            .collect()
    }

    async fn count(&self, text: &str, filter: SeriesFilter) -> Option<u32> {
        let search = search(text, filter);
        self.store
            .database()
            .read(move |connection| search_chapters_count(connection, &search))
            .await
            .unwrap()
    }
}

struct Page {
    hits: Vec<ChapterHit>,
    next: Option<Cursor>,
}

async fn add_linked_root(store: &Store, path: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: ADDED_AT_MS,
    };
    store
        .database()
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

fn scanned_book(root: RootId, chapter: &Chapter<'_>) -> ScannedBook {
    ScannedBook {
        series: NewSeries::local(chapter.series, ADDED_AT_MS).unwrap(),
        named_series: None,
        fingerprint: fingerprint_of(chapter.number),
        title: chapter.title.to_owned(),
        added_at_ms: ADDED_AT_MS,
        page_count: PAGES_PER_BOOK,
        details: BookDetails {
            title: chapter.comic_info_title.map(str::to_owned),
            tags: chapter.tags.clone(),
            age_rating: chapter.age_rating,
            is_manga: chapter.is_manga,
            ..BookDetails::default()
        },
        file: BookFile {
            root,
            location: format!("{}/{}.cbz", chapter.series, chapter.number).into(),
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

fn search(text: &str, filter: SeriesFilter) -> SeriesSearch {
    SeriesSearch {
        text: SearchText::parse(text).unwrap().unwrap(),
        filter,
    }
}

fn volume_title(number: u32) -> String {
    format!("Volume {number:04}")
}

fn hit(
    series: &str,
    title: &str,
    source: ChapterTitleSource,
) -> (String, String, ChapterTitleSource) {
    (series.to_owned(), title.to_owned(), source)
}

fn titles(pages: &[Page]) -> Vec<String> {
    pages
        .iter()
        .flat_map(|page| page.hits.iter().map(|hit| hit.title.clone()))
        .collect()
}

#[tokio::test]
async fn finds_a_book_by_its_file_name_and_says_so() {
    let library = Library::open("chapters-file-name").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Chapter 120"))
        .await;

    let found = library.finding("chapter 120").await;

    assert_eq!(
        found,
        [hit(LANTERNS, "Chapter 120", ChapterTitleSource::FileName)]
    );
}

#[tokio::test]
async fn finds_a_book_by_its_comic_info_title_and_says_so() {
    let library = Library::open("chapters-comic-info").await;
    library
        .record(
            Chapter::titled(1, LANTERNS, "Volume 01").with_comic_info_title("The Lantern Keeper"),
        )
        .await;

    let found = library.finding("lantern keeper").await;

    assert_eq!(
        found,
        [hit(
            LANTERNS,
            "The Lantern Keeper",
            ChapterTitleSource::ComicInfo
        )]
    );
}

#[tokio::test]
async fn finds_a_book_once_when_its_file_name_and_comic_info_title_both_match() {
    let library = Library::open("chapters-both-titles").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Harbor Gate 01").with_comic_info_title("Harbor Gate"))
        .await;

    let found = library.finding("harbor gate").await;
    let counted = library.count("harbor gate", SeriesFilter::NONE).await;

    assert_eq!(
        found,
        [hit(LANTERNS, "Harbor Gate", ChapterTitleSource::ComicInfo)]
    );
    assert_eq!(counted, Some(1));
}

#[tokio::test]
async fn finds_a_book_once_at_every_page_size_when_both_its_titles_match() {
    let library = Library::open("chapters-both-titles-paged").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Harbor Gate 01").with_comic_info_title("Harbor Gate"))
        .await;
    library
        .record_titled(MARKET, 2..6, |number| format!("Harbor Gate {number:02}"))
        .await;
    library
        .record(Chapter::titled(6, HARBOUR, "Volume 06").with_comic_info_title("Harbor Gate"))
        .await;
    let gate = search("harbor gate", SeriesFilter::NONE);

    let by_one = library.pages(&gate, 1).await;
    let by_two = library.pages(&gate, 2).await;
    let by_fifty = library.pages(&gate, 50).await;

    assert_eq!(titles(&by_fifty).len(), 6);
    assert_eq!(titles(&by_one), titles(&by_fifty));
    assert_eq!(titles(&by_two), titles(&by_fifty));
}

#[tokio::test]
async fn finds_a_book_by_its_file_name_when_only_that_title_matches() {
    let library = Library::open("chapters-only-file-name-matches").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Harbor Gate 01").with_comic_info_title("The Lantern"))
        .await;

    let found = library.finding("harbor gate").await;

    assert_eq!(
        found,
        [hit(
            LANTERNS,
            "Harbor Gate 01",
            ChapterTitleSource::FileName
        )]
    );
}

#[tokio::test]
async fn says_which_series_and_book_a_hit_belongs_to_and_the_book_s_place_in_the_series() {
    let library = Library::open("chapters-place").await;
    for number in 1..=3 {
        library
            .record(Chapter::titled(number, LANTERNS, &volume_title(number)))
            .await;
    }
    let series = NewSeries::local(LANTERNS, ADDED_AT_MS).unwrap().id();

    let page = library
        .page(&search("volume 0003", SeriesFilter::NONE), None, 10)
        .await;

    let books = library
        .store
        .database()
        .read(move |connection| {
            series_books(
                connection,
                series,
                BookListing::IN_ORDER,
                &PageRequest {
                    after: None,
                    size: PageSize::try_from(10).unwrap(),
                },
            )
        })
        .await
        .unwrap()
        .items;
    assert_eq!(page.hits.len(), 1);
    let found = &page.hits[0];
    let listed = books.iter().find(|summary| summary.id == book(3)).unwrap();
    assert_eq!(
        (found.series, found.book, found.position),
        (series, book(3), listed.position)
    );
    assert_eq!(listed.position, 3);
}

#[tokio::test]
async fn lists_hits_in_the_order_the_books_were_indexed() {
    let library = Library::open("chapters-index-order").await;
    library
        .record(Chapter::titled(1, MARKET, "Volume 02"))
        .await;
    library
        .record(Chapter::titled(2, LANTERNS, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(3, MARKET, "Volume 01"))
        .await;

    let found = library.finding("volume").await;

    assert_eq!(
        found,
        [
            hit(MARKET, "Volume 02", ChapterTitleSource::FileName),
            hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName),
            hit(MARKET, "Volume 01", ChapterTitleSource::FileName),
        ]
    );
}

#[tokio::test]
async fn pages_by_two_and_by_fifty_through_the_same_hits_without_gaps_or_repeats() {
    let library = Library::open("chapters-pages").await;
    library.record_titled(LANTERNS, 1..8, volume_title).await;
    let everything = search("volume", SeriesFilter::NONE);

    let by_two = library.pages(&everything, 2).await;
    let by_fifty = library.pages(&everything, 50).await;

    assert_eq!(
        by_two
            .iter()
            .map(|page| page.hits.len())
            .collect::<Vec<_>>(),
        [2, 2, 2, 1]
    );
    assert_eq!(by_fifty.len(), 1);
    assert_eq!(titles(&by_two), titles(&by_fifty));
    assert_eq!(titles(&by_fifty).len(), 7);
    assert!(by_fifty[0].next.is_none());
}

#[tokio::test]
async fn gives_a_short_page_and_a_next_cursor_when_the_window_of_candidates_ends() {
    let library = Library::open("chapters-short-page").await;
    library.record_tagged(CROWD, 1..WINDOW + 20, "crowd").await;
    library.record_tagged(HARBOUR, 5_000..5_003, WANTED).await;
    let wanted = search(
        "volume",
        SeriesFilter::NONE.with_tags(vec![WANTED.to_owned()]),
    );

    let first = library.page(&wanted, None, 10).await;

    assert!(first.hits.is_empty());
    assert!(first.next.is_some());
}

#[tokio::test]
async fn follows_the_cursors_of_short_pages_to_exactly_the_hits_of_the_filter() {
    let library = Library::open("chapters-follow-window").await;
    library.record_tagged(CROWD, 1..WINDOW + 20, "crowd").await;
    library.record_tagged(HARBOUR, 5_000..5_003, WANTED).await;
    let wanted = search(
        "volume",
        SeriesFilter::NONE.with_tags(vec![WANTED.to_owned()]),
    );

    let pages = library.pages(&wanted, 10).await;

    assert!(pages.len() >= 2);
    assert_eq!(
        titles(&pages),
        ["Volume 5000", "Volume 5001", "Volume 5002"]
    );
}

#[tokio::test]
async fn counts_nothing_final_while_the_window_of_candidates_ends_before_the_matches_do() {
    let library = Library::open("chapters-count-window-ends").await;
    library
        .record_titled(CROWD, 1..WINDOW + 2, volume_title)
        .await;

    let counted = library.count("volume", SeriesFilter::NONE).await;

    assert_eq!(counted, None);
}

#[tokio::test]
async fn counts_every_hit_when_the_matches_fill_the_window_exactly() {
    let library = Library::open("chapters-count-window-fills").await;
    library
        .record_titled(CROWD, 1..WINDOW + 1, volume_title)
        .await;

    let counted = library.count("volume", SeriesFilter::NONE).await;

    assert_eq!(counted, Some(WINDOW));
}

#[tokio::test]
async fn counts_what_the_pages_hold_when_the_window_is_not_exhausted() {
    let library = Library::open("chapters-count-agrees").await;
    library.record_titled(LANTERNS, 1..8, volume_title).await;
    library
        .record(Chapter::titled(20, MARKET, "Volume 20").with_comic_info_title("Volume Twenty"))
        .await;
    let everything = search("volume", SeriesFilter::NONE);

    let pages = library.pages(&everything, 3).await;
    let counted = library.count("volume", SeriesFilter::NONE).await;

    assert_eq!(counted, Some(8));
    assert_eq!(titles(&pages).len(), 8);
}

#[tokio::test]
async fn finds_only_the_chapters_of_series_carrying_a_chosen_tag() {
    let library = Library::open("chapters-tag-filter").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Volume 01").tagged("slow burn"))
        .await;
    library
        .record(Chapter::titled(2, MARKET, "Volume 01").tagged("comedy"))
        .await;
    library
        .record(Chapter::titled(3, HARBOUR, "Volume 01"))
        .await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_tags(vec!["slow burn".to_owned()]),
        )
        .await;

    assert_eq!(
        found,
        [hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName)]
    );
}

#[tokio::test]
async fn finds_only_the_chapters_of_series_holding_a_bookmark() {
    let library = Library::open("chapters-bookmark-filter").await;
    let bookmarked = library
        .record(Chapter::titled(1, LANTERNS, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(2, MARKET, "Volume 01"))
        .await;
    library.bookmark(bookmarked).await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_bookmarked(Inclusion::Only),
        )
        .await;

    assert_eq!(
        found,
        [hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName)]
    );
}

#[tokio::test]
async fn finds_only_the_chapters_of_the_one_series_a_tag_names() {
    let library = Library::open("chapters-one-series-filter").await;
    library.record_titled(MARKET, 1..4, volume_title).await;
    library.record_tagged(LANTERNS, 10..12, "lone tag").await;
    library.record_titled(HARBOUR, 20..23, volume_title).await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_tags(vec!["lone tag".to_owned()]),
        )
        .await;
    let counted = library
        .count(
            "volume",
            SeriesFilter::NONE.with_tags(vec!["lone tag".to_owned()]),
        )
        .await;

    assert_eq!(
        found,
        [
            hit(LANTERNS, "Volume 0010", ChapterTitleSource::FileName),
            hit(LANTERNS, "Volume 0011", ChapterTitleSource::FileName),
        ]
    );
    assert_eq!(counted, Some(2));
}

#[tokio::test]
async fn finds_only_the_chapters_of_series_the_reading_filter_lets_through() {
    let library = Library::open("chapters-finished-filter").await;
    let read = library
        .record(Chapter::titled(1, LANTERNS, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(2, MARKET, "Volume 01"))
        .await;
    library
        .store
        .write(move |writer| writer.set_read(read, true))
        .await
        .unwrap();

    let found = [
        library
            .finding_through("volume", SeriesFilter::NONE.with_finished(Inclusion::Only))
            .await,
        library
            .finding_through("volume", SeriesFilter::NONE.with_finished(Inclusion::Hide))
            .await,
    ];

    assert_eq!(
        found,
        [
            [hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName)],
            [hit(MARKET, "Volume 01", ChapterTitleSource::FileName)],
        ]
    );
}

async fn library_of_manga_comics_and_books(name: &str) -> Library {
    let library = Library::open(name).await;
    library
        .record(Chapter::titled(1, LANTERNS, "Volume 01").manga(true))
        .await;
    library
        .record(Chapter::titled(2, LANTERNS, "Volume 02").manga(false))
        .await;
    library
        .record(Chapter::titled(3, MARKET, "Volume 01").manga(false))
        .await;
    library
}

#[tokio::test]
async fn finds_every_chapter_of_a_series_holding_manga_under_the_manga_format() {
    let library = library_of_manga_comics_and_books("chapters-manga").await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_formats(vec![SeriesFormat::Manga]),
        )
        .await;

    assert_eq!(
        found,
        [
            hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName),
            hit(LANTERNS, "Volume 02", ChapterTitleSource::FileName),
        ]
    );
}

#[tokio::test]
async fn finds_the_chapters_of_series_holding_no_manga_under_the_comic_format() {
    let library = library_of_manga_comics_and_books("chapters-comic").await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_formats(vec![SeriesFormat::Comic]),
        )
        .await;

    assert_eq!(
        found,
        [hit(MARKET, "Volume 01", ChapterTitleSource::FileName)]
    );
}

#[tokio::test]
async fn finds_no_chapter_under_the_book_format_the_library_cannot_hold_yet() {
    let library = library_of_manga_comics_and_books("chapters-book-format").await;

    let found = library
        .finding_through(
            "volume",
            SeriesFilter::NONE.with_formats(vec![SeriesFormat::Book]),
        )
        .await;

    assert_eq!(found, []);
}

#[tokio::test]
async fn finds_nothing_in_a_series_whose_folder_is_missing() {
    let library = Library::open("chapters-missing-folder").await;
    let missing = add_linked_root(&library.store, "/media/Manga").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Volume 01"))
        .await;
    library
        .record_in(missing, Chapter::titled(2, MARKET, "Volume 01"))
        .await;
    library
        .store
        .database()
        .write(move |transaction| mark_root_unavailable(transaction, missing, MISSING_SINCE_MS))
        .await
        .unwrap();

    let found = library.finding("volume").await;
    let counted = library.count("volume", SeriesFilter::NONE).await;

    assert_eq!(
        found,
        [hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName)]
    );
    assert_eq!(counted, Some(1));
}

#[tokio::test]
async fn finds_nothing_in_a_series_without_books() {
    let library = Library::open("chapters-no-books").await;
    library.add_series_without_books("Volume Annex").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Chapter 01"))
        .await;

    let found = library.finding("volume").await;

    assert_eq!(found, []);
}

#[tokio::test]
async fn finds_nothing_in_a_book_removed_from_the_library() {
    let library = Library::open("chapters-removed-book").await;
    let removed = library
        .record(Chapter::titled(1, LANTERNS, "Volume 01").with_comic_info_title("Volume Lantern"))
        .await;
    library
        .record(Chapter::titled(2, LANTERNS, "Volume 02"))
        .await;

    library
        .store
        .write(move |writer| writer.remove_books_from_library(&[removed]))
        .await
        .unwrap();

    let found = library.finding("volume").await;
    assert_eq!(
        found,
        [hit(LANTERNS, "Volume 02", ChapterTitleSource::FileName)]
    );
}

fn hiding_adult() -> SeriesFilter {
    SeriesFilter::NONE.with_adult(Inclusion::Hide, true)
}

async fn library_with_adult_series(name: &str) -> Library {
    let library = Library::open(name).await;
    library
        .record(Chapter::titled(1, LANTERNS, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(2, FORBIDDEN, "Volume 01").rated_adult())
        .await;
    library
        .record(Chapter::titled(3, MARKET, "Volume 01").with_comic_info_title("Secret Passage"))
        .await;
    library.mark_adult(MARKET).await;
    library
        .record(Chapter::titled(4, FORBIDDEN, "Hidden Stair").rated_adult())
        .await;
    library
}

#[tokio::test]
async fn leaves_out_the_chapters_of_series_rated_or_marked_18_plus_while_hiding_them() {
    let library = library_with_adult_series("chapters-adult-hidden").await;

    let hidden = library.finding_through("volume", hiding_adult()).await;
    let shown = library.finding("volume").await;

    assert_eq!(
        hidden,
        [hit(LANTERNS, "Volume 01", ChapterTitleSource::FileName)]
    );
    assert_eq!(shown.len(), 3);
}

#[tokio::test]
async fn gives_an_empty_page_without_a_next_cursor_when_only_a_hidden_adult_chapter_matches() {
    let library = library_with_adult_series("chapters-adult-only-hidden").await;

    let pages = library
        .pages(&search("hidden stair", hiding_adult()), 10)
        .await;
    let counted = library.count("hidden stair", hiding_adult()).await;

    assert_eq!(pages.len(), 1);
    assert!(pages[0].hits.is_empty());
    assert!(pages[0].next.is_none());
    assert_eq!(counted, Some(0));
}

#[tokio::test]
async fn reaches_the_one_shown_chapter_after_a_window_of_hidden_adult_chapters_and_ends_there() {
    let library = Library::open("chapters-hidden-mass-before").await;
    library.record_adult_titled(FORBIDDEN, 1..WINDOW + 20).await;
    library
        .record(Chapter::titled(9_000, LANTERNS, "Volume 9000"))
        .await;
    let hiding = search("volume", hiding_adult());

    let pages = library.pages(&hiding, 10).await;
    let counted = library.count("volume", hiding_adult()).await;

    assert_eq!(titles(&pages), ["Volume 9000"]);
    assert_eq!(pages.len(), 1);
    assert!(pages[0].next.is_none());
    assert_eq!(counted, Some(1));
}

#[tokio::test]
async fn ends_at_the_one_shown_chapter_before_a_window_of_hidden_adult_chapters() {
    let library = Library::open("chapters-hidden-mass-after").await;
    library
        .record(Chapter::titled(9_000, LANTERNS, "Volume 9000"))
        .await;
    library.record_adult_titled(FORBIDDEN, 1..WINDOW + 20).await;
    let hiding = search("volume", hiding_adult());

    let pages = library.pages(&hiding, 10).await;
    let counted = library.count("volume", hiding_adult()).await;

    assert_eq!(titles(&pages), ["Volume 9000"]);
    assert_eq!(pages.len(), 1);
    assert!(pages[0].next.is_none());
    assert_eq!(counted, Some(1));
}

#[tokio::test]
async fn gives_an_empty_page_without_a_next_cursor_when_a_window_of_chapters_is_all_hidden_adult() {
    let library = Library::open("chapters-all-hidden-mass").await;
    library.record_adult_titled(FORBIDDEN, 1..WINDOW + 20).await;
    let hiding = search("volume", hiding_adult());

    let pages = library.pages(&hiding, 10).await;
    let counted = library.count("volume", hiding_adult()).await;

    assert_eq!(pages.len(), 1);
    assert!(pages[0].hits.is_empty());
    assert!(pages[0].next.is_none());
    assert_eq!(counted, Some(0));
}

#[tokio::test]
async fn counts_the_chapters_of_shown_series_only_while_hiding_adult_ones() {
    let library = library_with_adult_series("chapters-adult-count").await;

    let counts = [
        library.count("volume", SeriesFilter::NONE).await,
        library.count("volume", hiding_adult()).await,
        library
            .count(
                "volume",
                SeriesFilter::NONE.with_adult(Inclusion::Hide, false),
            )
            .await,
    ];

    assert_eq!(counts, [Some(3), Some(1), Some(2)]);
}

#[tokio::test]
async fn refuses_a_cursor_from_the_series_search_for_the_chapter_search() {
    let library = Library::open("chapters-series-cursor").await;
    library
        .record(Chapter::titled(1, "Volume Keepers", "Volume 01"))
        .await;
    library
        .record(Chapter::titled(2, "Volume Market", "Volume 01"))
        .await;
    let series_search = SeriesSearch {
        text: SearchText::parse("volume").unwrap().unwrap(),
        filter: SeriesFilter::NONE,
    };
    let first_series = PageRequest {
        after: None,
        size: PageSize::try_from(1).unwrap(),
    };
    let series_cursor = library
        .store
        .database()
        .read({
            let series_search = series_search.clone();
            move |connection| search_page(connection, &series_search, &first_series)
        })
        .await
        .unwrap()
        .next
        .unwrap();

    let refused = library
        .store
        .database()
        .read(move |connection| {
            search_chapters(
                connection,
                &series_search,
                &PageRequest {
                    after: Some(series_cursor),
                    size: PageSize::try_from(1).unwrap(),
                },
            )
        })
        .await;

    assert!(matches!(refused, Err(Error::CursorForAnotherList)));
}

#[tokio::test]
async fn refuses_a_cursor_from_the_chapter_search_for_the_series_search() {
    let library = Library::open("chapters-chapter-cursor").await;
    library.record_titled(LANTERNS, 1..4, volume_title).await;
    let everything = search("volume", SeriesFilter::NONE);
    let chapter_cursor = library.page(&everything, None, 1).await.next.unwrap();

    let refused = library
        .store
        .database()
        .read(move |connection| {
            search_page(
                connection,
                &everything,
                &PageRequest {
                    after: Some(chapter_cursor),
                    size: PageSize::try_from(1).unwrap(),
                },
            )
        })
        .await;

    assert!(matches!(refused, Err(Error::CursorForAnotherList)));
}

#[tokio::test]
async fn finds_nothing_for_text_shorter_than_a_trigram() {
    let library = Library::open("chapters-short-text").await;
    library
        .record(Chapter::titled(1, LANTERNS, "Volume 01"))
        .await;

    let pages = library.pages(&search("vo", SeriesFilter::NONE), 10).await;
    let counted = library.count("vo", SeriesFilter::NONE).await;

    assert_eq!(pages.len(), 1);
    assert!(pages[0].hits.is_empty());
    assert!(pages[0].next.is_none());
    assert_eq!(counted, Some(0));
}

#[tokio::test]
async fn lists_books_with_the_same_title_in_the_order_they_were_indexed_every_time() {
    let library = Library::open("chapters-ties").await;
    library
        .record(Chapter::titled(1, MARKET, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(2, LANTERNS, "Volume 01"))
        .await;
    library
        .record(Chapter::titled(3, HARBOUR, "Volume 01"))
        .await;

    let first = library.finding("volume 01").await;
    let again = library.finding("volume 01").await;

    assert_eq!(first, again);
    assert_eq!(
        first
            .iter()
            .map(|(series, ..)| series.as_str())
            .collect::<Vec<_>>(),
        [MARKET, LANTERNS, HARBOUR]
    );
}

fn gate_title(number: u32) -> String {
    format!("Harbor Gate {number:04}")
}

#[tokio::test]
async fn walks_every_hit_once_across_the_window_boundary_at_page_sizes_that_align_with_it_or_not() {
    let library = Library::open("chapters-window-boundary").await;
    library
        .record_one_in_twenty_tagged(1..WINDOW + 150, gate_title)
        .await;
    let wanted = search(
        "harbor gate",
        SeriesFilter::NONE.with_tags(vec![WANTED.to_owned()]),
    );
    let expected: Vec<String> = (1..WINDOW + 150)
        .filter(|number| number % TAGGED_EVERY == 0)
        .map(gate_title)
        .collect();

    let walks = [
        library.pages(&wanted, 200).await,
        library.pages(&wanted, 50).await,
        library.pages(&wanted, 70).await,
    ];

    for walk in &walks {
        assert_eq!(titles(walk), expected);
        assert!(walk.last().unwrap().next.is_none());
    }
}

#[tokio::test]
async fn returns_a_book_by_its_comic_info_title_when_its_dropped_file_name_row_ends_the_window() {
    let library = Library::open("chapters-split-across-windows").await;
    library
        .record_one_in_twenty_tagged(1..WINDOW, gate_title)
        .await;
    let split = library
        .record(
            Chapter::titled(5_000, HARBOUR, "Harbor Gate 5000")
                .with_comic_info_title("Harbor Gate")
                .tagged(WANTED),
        )
        .await;
    let wanted = search(
        "harbor gate",
        SeriesFilter::NONE.with_tags(vec![WANTED.to_owned()]),
    );

    let ids = library.index_ids_of(split).await;
    let pages = library.pages(&wanted, 200).await;

    assert_eq!(
        ids,
        [
            ("file_name".to_owned(), i64::from(WINDOW)),
            ("comic_info".to_owned(), i64::from(WINDOW) + 1),
        ]
    );
    assert_eq!(
        pages.iter().map(|page| page.hits.len()).collect::<Vec<_>>(),
        [99, 1]
    );
    let found: Vec<_> = pages.iter().flat_map(|page| page.hits.iter()).collect();
    let splits: Vec<_> = found.iter().filter(|hit| hit.book == split).collect();
    assert_eq!(splits.len(), 1);
    assert_eq!(splits[0].matched_in, ChapterTitleSource::ComicInfo);
    assert!(pages.last().unwrap().next.is_none());
}

#[tokio::test]
async fn walks_books_found_by_both_titles_once_each_when_their_rows_pass_the_window_but_the_books_do_not()
 {
    let library = Library::open("chapters-two-rows-per-book").await;
    library.record_titled_in_both_places(CROWD, 1..1_101).await;
    let gate = search("harbor gate", SeriesFilter::NONE);

    let pages = library.pages(&gate, 200).await;
    let counted = library.count("harbor gate", SeriesFilter::NONE).await;

    let found = titles(&pages);
    assert_eq!(found.len(), 1_100);
    assert!(found.iter().all(|title| title == "Harbor Gate"));
    assert!(pages.last().unwrap().next.is_none());
    assert_eq!(counted, None);
}
