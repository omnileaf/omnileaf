#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    Database, Error,
    catalog::{
        Cursor, Inclusion, NewBook, NewSeries, PageRequest, PageSize, SeriesFilter, SeriesListing,
        SeriesOrder, SeriesSort, add_book, remove_books_without_files, series_count, series_page,
    },
    store::{Clock, LatestKey, Store, Writer},
};
use omnileaf_sync_proto::BookId;
use proptest::{collection::vec, prelude::*};
use support::{ScratchFolder, library_config};

const TWO_BOOKS: &[&str] = &["Volume 01", "Volume 02"];
const WHOLE_LIBRARY: u16 = 50;
const A_TO_Z: SeriesSort = SeriesSort::ascending(SeriesOrder::Title);

/// Six series of two books, each read up to a different point.
const READING_STAGES: [SeriesSeed<'static>; 6] = [
    two_books_added_at("Sample Series 01", 10),
    two_books_added_at("Sample Series 02", 20),
    two_books_added_at("Sample Series 03", 30),
    two_books_added_at("Sample Series 04", 40),
    two_books_added_at("Sample Series 05", 50),
    two_books_added_at("Sample Series 06", 60),
];

const fn two_books_added_at(name: &str, added_at_ms: i64) -> SeriesSeed<'_> {
    SeriesSeed {
        name,
        added_at_ms,
        book_titles: TWO_BOOKS,
    }
}

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

    /// Leaves 01 untouched, opens a book of 02, marks one book of 03 read, both of 04 read, marks 05's books unread, and reads 06 through but leaves a book marked unread.
    async fn at_reading_stages(name: &str) -> Self {
        let library = Self::with(name, &READING_STAGES).await;
        library
            .write(|writer| {
                writer.set_position(book("Sample Series 02", "Volume 01"), 3)?;
                writer.set_read(book("Sample Series 03", "Volume 01"), true)?;
                writer.set_read(book("Sample Series 04", "Volume 01"), true)?;
                writer.set_read(book("Sample Series 04", "Volume 02"), true)?;
                writer.set_read(book("Sample Series 05", "Volume 01"), false)?;
                writer.set_read(book("Sample Series 05", "Volume 02"), false)?;
                writer.raise_furthest(book("Sample Series 06", "Volume 01"), 30)?;
                writer.set_read(book("Sample Series 06", "Volume 02"), true)?;
                writer.set_read(book("Sample Series 06", "Volume 01"), false)
            })
            .await;
        library
    }

    async fn write(&self, job: impl FnOnce(&mut Writer<'_>) -> Result<(), Error> + Send + 'static) {
        self.store.write(job).await.unwrap();
    }

    async fn titles(&self, listing: SeriesListing) -> Vec<String> {
        self.pages(listing, WHOLE_LIBRARY).await.concat()
    }

    /// Passes every cursor through its text form, as one crossing to the interface would.
    async fn pages(&self, listing: SeriesListing, size: u16) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut after: Option<Cursor> = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(size).unwrap(),
            };
            let page = self
                .store
                .database()
                .read(move |connection| series_page(connection, &listing, &request))
                .await
                .unwrap();
            pages.push(page.items.into_iter().map(|series| series.title).collect());
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }

    async fn filtered(&self, filter: SeriesFilter) -> Vec<String> {
        self.titles(SeriesListing {
            sort: A_TO_Z,
            filter,
        })
        .await
    }

    async fn count(&self, filter: SeriesFilter) -> u32 {
        self.store
            .database()
            .read(move |connection| series_count(connection, &filter))
            .await
            .unwrap()
    }
}

fn book(series: &str, title: &str) -> BookId {
    BookId::local(&fingerprint(series, title))
}

const fn unread(inclusion: Inclusion) -> SeriesFilter {
    SeriesFilter {
        unread: inclusion,
        ..SeriesFilter::NONE
    }
}

const fn started(inclusion: Inclusion) -> SeriesFilter {
    SeriesFilter {
        started: inclusion,
        ..SeriesFilter::NONE
    }
}

const fn finished(inclusion: Inclusion) -> SeriesFilter {
    SeriesFilter {
        finished: inclusion,
        ..SeriesFilter::NONE
    }
}

fn titles(numbers: &[u8]) -> Vec<String> {
    numbers
        .iter()
        .map(|number| format!("Sample Series {number:02}"))
        .collect()
}

#[tokio::test]
async fn pages_the_library_by_title_from_z_to_a() {
    let library = Library::with("z-to-a", &READING_STAGES[..5]).await;

    let pages = library
        .pages(
            SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::Title)),
            2,
        )
        .await;

    assert_eq!(pages, [titles(&[5, 4]), titles(&[3, 2]), titles(&[1])],);
}

#[tokio::test]
async fn pages_the_library_by_earliest_added_first() {
    let library = Library::with(
        "earliest-added",
        &[
            two_books_added_at("Sample Series 01", 20),
            two_books_added_at("Sample Series 02", 50),
            two_books_added_at("Sample Series 03", 30),
            two_books_added_at("Sample Series 04", 10),
            two_books_added_at("Sample Series 05", 40),
        ],
    )
    .await;

    let pages = library
        .pages(
            SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::DateAdded)),
            2,
        )
        .await;

    assert_eq!(pages, [titles(&[4, 1]), titles(&[3, 5]), titles(&[2])],);
}

#[tokio::test]
async fn lists_only_the_series_holding_a_book_not_marked_read() {
    let library = Library::at_reading_stages("only-unread").await;

    let listed = library.filtered(unread(Inclusion::Only)).await;

    assert_eq!(listed, titles(&[1, 2, 3, 5, 6]));
}

#[tokio::test]
async fn hides_the_series_holding_a_book_not_marked_read() {
    let library = Library::at_reading_stages("hide-unread").await;

    let listed = library.filtered(unread(Inclusion::Hide)).await;

    assert_eq!(listed, titles(&[4]));
}

#[tokio::test]
async fn lists_only_the_series_with_a_book_opened_or_marked_read() {
    let library = Library::at_reading_stages("only-started").await;

    let listed = library.filtered(started(Inclusion::Only)).await;

    assert_eq!(listed, titles(&[2, 3, 4, 6]));
}

#[tokio::test]
async fn hides_the_series_with_a_book_opened_or_marked_read() {
    let library = Library::at_reading_stages("hide-started").await;

    let listed = library.filtered(started(Inclusion::Hide)).await;

    assert_eq!(listed, titles(&[1, 5]));
}

#[tokio::test]
async fn lists_only_the_series_with_every_book_marked_read() {
    let library = Library::at_reading_stages("only-finished").await;

    let listed = library.filtered(finished(Inclusion::Only)).await;

    assert_eq!(listed, titles(&[4]));
}

#[tokio::test]
async fn hides_the_series_with_every_book_marked_read() {
    let library = Library::at_reading_stages("hide-finished").await;

    let listed = library.filtered(finished(Inclusion::Hide)).await;

    assert_eq!(listed, titles(&[1, 2, 3, 5, 6]));
}

#[tokio::test]
async fn lists_only_the_series_meeting_every_condition_of_the_filter() {
    let library = Library::at_reading_stages("every-condition").await;

    let listed = library
        .filtered(SeriesFilter {
            unread: Inclusion::Only,
            started: Inclusion::Only,
            finished: Inclusion::Any,
        })
        .await;

    assert_eq!(listed, titles(&[2, 3, 6]));
}

#[tokio::test]
async fn carries_a_filtered_list_on_from_each_page_s_cursor() {
    let library = Library::at_reading_stages("filtered-pages").await;

    let pages = library
        .pages(
            SeriesListing {
                sort: SeriesSort::descending(SeriesOrder::DateAdded),
                filter: started(Inclusion::Only),
            },
            3,
        )
        .await;

    assert_eq!(pages, [titles(&[6, 4, 3]), titles(&[2])]);
}

#[tokio::test]
async fn counts_only_the_series_the_filter_lists() {
    let library = Library::at_reading_stages("filtered-count").await;

    let counts = [
        library.count(SeriesFilter::NONE).await,
        library.count(unread(Inclusion::Only)).await,
        library.count(started(Inclusion::Hide)).await,
        library.count(finished(Inclusion::Only)).await,
    ];

    assert_eq!(counts, [6, 5, 2, 1]);
}

#[tokio::test]
async fn counts_a_book_read_before_it_was_found_once_it_is_added() {
    let library = Library::with("read-before-found", &READING_STAGES[..2]).await;
    let found_later = NewBook {
        fingerprint: fingerprint("Sample Series 01", "Volume 03"),
        series: NewSeries::local("Sample Series 01", 0).unwrap().id(),
        title: "Volume 03".to_owned(),
        added_at_ms: 0,
    };
    library
        .write(|writer| {
            writer.set_read(book("Sample Series 01", "Volume 01"), true)?;
            writer.set_read(book("Sample Series 01", "Volume 02"), true)?;
            writer.set_read(book("Sample Series 01", "Volume 03"), true)
        })
        .await;

    library
        .store
        .database()
        .write(move |transaction| add_book(transaction, &found_later))
        .await
        .unwrap();

    let listed = library.filtered(finished(Inclusion::Only)).await;
    assert_eq!(listed, titles(&[1]));
}

#[tokio::test]
async fn stops_counting_the_reading_state_of_a_book_once_it_is_removed() {
    let library = Library::with("read-then-removed", &READING_STAGES[..2]).await;
    library
        .write(|writer| writer.set_read(book("Sample Series 01", "Volume 01"), true))
        .await;

    library
        .store
        .database()
        .write(|transaction| {
            remove_books_without_files(transaction, &[book("Sample Series 01", "Volume 02")])
        })
        .await
        .unwrap();

    let listed = library.filtered(finished(Inclusion::Only)).await;
    assert_eq!(listed, titles(&[1]));
}

#[tokio::test]
async fn takes_a_read_book_s_state_along_when_it_moves_to_another_series() {
    let library = Library::with("read-then-moved", &READING_STAGES[..2]).await;
    library
        .write(|writer| writer.set_read(book("Sample Series 01", "Volume 01"), true))
        .await;

    library
        .store
        .database()
        .write(|transaction| {
            transaction.execute(
                "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                 WHERE id = ?2",
                (
                    "Sample Series 02",
                    book("Sample Series 01", "Volume 01").as_bytes(),
                ),
            )?;
            Ok(())
        })
        .await
        .unwrap();

    let listed = library.filtered(started(Inclusion::Only)).await;
    assert_eq!(listed, titles(&[2]));
}

#[tokio::test]
async fn keeps_the_counts_once_the_states_are_projected_again_from_their_registers() {
    let library = Library::at_reading_stages("projected-again").await;

    library.store.rebuild_projections().await.unwrap();

    let counts = [
        library.count(unread(Inclusion::Only)).await,
        library.count(started(Inclusion::Only)).await,
        library.count(finished(Inclusion::Only)).await,
    ];
    assert_eq!(counts, [5, 4, 1]);
}

/// One reading write to one of a series' books, by the book's number.
#[derive(Clone, Copy, Debug)]
enum ReadingWrite {
    Position(usize),
    Furthest(usize),
    Read(usize, bool),
    ClearPosition(usize),
    ClearRead(usize),
}

const BOOKS_PER_SERIES: usize = 3;
const BOOK_TITLES: [&str; BOOKS_PER_SERIES] = ["Volume 01", "Volume 02", "Volume 03"];

/// What each of a series' books has been through, as a reader of the registers would see it.
#[derive(Clone, Copy, Debug, Default)]
struct BookModel {
    has_position: bool,
    has_furthest: bool,
    is_read: Option<bool>,
}

impl BookModel {
    fn after(mut self, write: ReadingWrite) -> Self {
        match write {
            ReadingWrite::Position(_) => self.has_position = true,
            ReadingWrite::Furthest(_) => self.has_furthest = true,
            ReadingWrite::Read(_, is_read) => self.is_read = Some(is_read),
            ReadingWrite::ClearPosition(_) => self.has_position = false,
            ReadingWrite::ClearRead(_) => self.is_read = None,
        }
        self
    }

    fn is_started(self) -> bool {
        self.has_position || self.has_furthest || self.is_read == Some(true)
    }
}

const fn book_of(write: ReadingWrite) -> usize {
    match write {
        ReadingWrite::Position(book)
        | ReadingWrite::Furthest(book)
        | ReadingWrite::Read(book, _)
        | ReadingWrite::ClearPosition(book)
        | ReadingWrite::ClearRead(book) => book,
    }
}

fn reading_write() -> impl Strategy<Value = ReadingWrite> {
    let book = 0..BOOKS_PER_SERIES;
    prop_oneof![
        book.clone().prop_map(ReadingWrite::Position),
        book.clone().prop_map(ReadingWrite::Furthest),
        (book.clone(), any::<bool>()).prop_map(|(book, is_read)| ReadingWrite::Read(book, is_read)),
        book.clone().prop_map(ReadingWrite::ClearPosition),
        book.prop_map(ReadingWrite::ClearRead),
    ]
}

fn apply(writer: &mut Writer<'_>, write: ReadingWrite) -> Result<(), Error> {
    let target = book("Sample Series 01", BOOK_TITLES.get(book_of(write)).unwrap());
    match write {
        ReadingWrite::Position(_) => writer.set_position(target, 1),
        ReadingWrite::Furthest(_) => writer.raise_furthest(target, 1),
        ReadingWrite::Read(_, is_read) => writer.set_read(target, is_read),
        ReadingWrite::ClearPosition(_) => writer.clear(LatestKey::BookPosition(target)),
        ReadingWrite::ClearRead(_) => writer.clear(LatestKey::BookRead(target)),
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn filters_a_series_by_its_books_reading_state_whatever_was_written_before(
        writes in vec(reading_write(), 0..12),
    ) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        let mut books = [BookModel::default(); BOOKS_PER_SERIES];
        for &write in &writes {
            books[book_of(write)] = books[book_of(write)].after(write);
        }
        let expected = [
            books.iter().any(|book| book.is_read != Some(true)),
            books.iter().any(|book| book.is_started()),
            books.iter().all(|book| book.is_read == Some(true)),
        ];

        let listed = runtime.block_on(async {
            let library = Library::with(
                "reading-state-property",
                &[SeriesSeed {
                    added_at_ms: 0,
                    book_titles: &BOOK_TITLES,
                    ..SeriesSeed::named("Sample Series 01")
                }],
            )
            .await;
            library
                .write(move |writer| writes.iter().try_for_each(|&write| apply(writer, write)))
                .await;
            [
                library.count(unread(Inclusion::Only)).await == 1,
                library.count(started(Inclusion::Only)).await == 1,
                library.count(finished(Inclusion::Only)).await == 1,
            ]
        });

        prop_assert_eq!(listed, expected);
    }
}
