#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use std::{cmp::Reverse, fmt::Write};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Connection, Database, Error,
    catalog::{
        Cursor, NewSeries, Page, PageRequest, PageSize, SeriesOrder, series_books, series_count,
        series_page,
    },
};
use omnileaf_sync_proto::SeriesId;
use support::ScratchFolder;

fn series_added_at(name: &str, added_at_ms: i64) -> SeriesSeed<'_> {
    SeriesSeed {
        added_at_ms,
        ..SeriesSeed::named(name)
    }
}

fn series_holding<'a>(name: &'a str, book_titles: &'a [&'a str]) -> SeriesSeed<'a> {
    SeriesSeed {
        book_titles,
        ..SeriesSeed::named(name)
    }
}

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with(series: &[SeriesSeed<'_>]) -> Self {
        let folder = ScratchFolder::new("library-pages");
        let database = Database::open(&folder.config()).unwrap();
        seed_library(&database, series).await;
        Self {
            database,
            _folder: folder,
        }
    }

    async fn page<L: List>(
        &self,
        list: L,
        after: Option<Cursor>,
        size: u16,
    ) -> Result<Page<String>, Error> {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        self.database
            .read(move |connection| list(connection, &request))
            .await
    }

    /// Passes every cursor through its text form, as one crossing to the interface would.
    async fn walk<L: List + Clone>(&self, list: L, size: u16) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut after = None;
        loop {
            let page = self.page(list.clone(), after, size).await.unwrap();
            pages.push(page.items);
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }
}

trait List: FnOnce(&Connection, &PageRequest) -> Result<Page<String>, Error> + Send + 'static {}

impl<F> List for F where
    F: FnOnce(&Connection, &PageRequest) -> Result<Page<String>, Error> + Send + 'static
{
}

fn series_titles(order: SeriesOrder) -> impl List + Clone {
    move |connection: &Connection, request: &PageRequest| {
        let page = series_page(connection, order, request)?;
        Ok(Page {
            items: page.items.into_iter().map(|series| series.title).collect(),
            next: page.next,
        })
    }
}

fn book_titles(series: SeriesId) -> impl List + Clone {
    move |connection: &Connection, request: &PageRequest| {
        let page = series_books(connection, series, request)?;
        Ok(Page {
            items: page.items.into_iter().map(|book| book.title).collect(),
            next: page.next,
        })
    }
}

#[tokio::test]
async fn pages_the_library_by_title_with_numbers_in_order_of_value() {
    let library = Library::with(&[
        SeriesSeed::named("Sample Series 10"),
        SeriesSeed::named("Sample Series 9"),
        SeriesSeed::named("sample series 1"),
        SeriesSeed::named("Example Series"),
        SeriesSeed::named("Sample Series 2"),
    ])
    .await;

    let pages = library.walk(series_titles(SeriesOrder::Title), 2).await;

    assert_eq!(
        pages,
        [
            vec!["Example Series", "sample series 1"],
            vec!["Sample Series 2", "Sample Series 9"],
            vec!["Sample Series 10"],
        ]
    );
}

#[tokio::test]
async fn pages_the_library_by_most_recently_added_first() {
    let library = Library::with(&[
        series_added_at("Sample Series 01", 20),
        series_added_at("Sample Series 02", 50),
        series_added_at("Sample Series 03", 30),
        series_added_at("Sample Series 04", 10),
        series_added_at("Sample Series 05", 40),
    ])
    .await;

    let pages = library
        .walk(series_titles(SeriesOrder::RecentlyAdded), 2)
        .await;

    assert_eq!(
        pages,
        [
            vec!["Sample Series 02", "Sample Series 05"],
            vec!["Sample Series 03", "Sample Series 01"],
            vec!["Sample Series 04"],
        ]
    );
}

#[tokio::test]
async fn pages_series_added_at_the_same_moment_by_descending_id() {
    let names = [
        "Sample Series 01",
        "Sample Series 02",
        "Sample Series 03",
        "Sample Series 04",
        "Sample Series 05",
    ];
    let library = Library::with(&names.map(SeriesSeed::named)).await;
    let mut expected = names;
    expected.sort_by_key(|name| Reverse(series_id(name)));

    let pages = library
        .walk(series_titles(SeriesOrder::RecentlyAdded), 2)
        .await;

    assert_eq!(pages.concat(), expected);
}

#[tokio::test]
async fn ends_on_a_full_last_page_without_an_empty_one_after_it() {
    let library = Library::with(&[
        SeriesSeed::named("Sample Series 01"),
        SeriesSeed::named("Sample Series 02"),
    ])
    .await;

    let pages = library.walk(series_titles(SeriesOrder::Title), 2).await;

    assert_eq!(pages, [["Sample Series 01", "Sample Series 02"]]);
}

#[tokio::test]
async fn leaves_series_without_books_off_the_library_pages() {
    let library = Library::with(&[
        series_holding("Sample Series 01", &[]),
        series_added_at("Sample Series 02", 2),
    ])
    .await;

    let pages = [
        library.walk(series_titles(SeriesOrder::Title), 10).await,
        library
            .walk(series_titles(SeriesOrder::RecentlyAdded), 10)
            .await,
    ];

    assert_eq!(pages, [[["Sample Series 02"]], [["Sample Series 02"]]]);
}

#[tokio::test]
async fn counts_the_series_the_library_pages_list() {
    let library = Library::with(&[
        series_holding("Sample Series 01", &[]),
        series_added_at("Sample Series 02", 2),
        SeriesSeed {
            added_at_ms: 3,
            book_titles: &["Volume 01", "Volume 02"],
            ..SeriesSeed::named("Sample Series 03")
        },
    ])
    .await;

    let count = library.database.read(series_count).await.unwrap();

    assert_eq!(count, 2);
}

#[tokio::test]
async fn counts_the_books_of_each_listed_series_not_marked_read() {
    let library = Library::with(&[
        series_holding(
            "Sample Series 01",
            &["Volume 01", "Volume 02", "Volume 03", "Volume 04"],
        ),
        series_holding("Sample Series 02", &["Volume 01", "Volume 02"]),
    ])
    .await;
    library
        .database
        .write(|transaction| {
            let mut state = transaction.prepare(
                "INSERT INTO book_state (book_id, position_page, is_read)
                SELECT book.id, ?3, ?4 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = ?2",
            )?;
            state.execute(("Sample Series 01", "Volume 01", 30, true))?;
            state.execute(("Sample Series 01", "Volume 02", 4, false))?;
            state.execute(("Sample Series 01", "Volume 03", 9, None::<bool>))?;
            state.execute(("Sample Series 02", "Volume 02", 12, true))?;
            Ok(())
        })
        .await
        .unwrap();

    let page = library
        .database
        .read(|connection| {
            let request = PageRequest {
                after: None,
                size: PageSize::try_from(10).unwrap(),
            };
            series_page(connection, SeriesOrder::Title, &request)
        })
        .await
        .unwrap();

    let unread: Vec<(String, u32)> = page
        .items
        .into_iter()
        .map(|series| (series.title, series.unread_count))
        .collect();
    assert_eq!(
        unread,
        [
            ("Sample Series 01".to_owned(), 3),
            ("Sample Series 02".to_owned(), 1),
        ]
    );
}

#[tokio::test]
async fn pages_a_series_books_in_natural_order() {
    let library = Library::with(&[
        series_holding(
            "Sample Series 01",
            &["Volume 10", "Volume 2", "volume 1", "Extra"],
        ),
        series_holding("Sample Series 02", &["Volume 3"]),
    ])
    .await;

    let pages = library
        .walk(book_titles(series_id("Sample Series 01")), 3)
        .await;

    assert_eq!(
        pages,
        [vec!["Extra", "volume 1", "Volume 2"], vec!["Volume 10"]]
    );
}

#[tokio::test]
async fn gives_a_series_missing_from_the_catalog_an_empty_page_of_books() {
    let library = Library::with(&[SeriesSeed::named("Sample Series 01")]).await;

    let pages = library
        .walk(book_titles(series_id("Sample Series 09")), 3)
        .await;

    assert_eq!(pages, [Vec::<String>::new()]);
}

#[tokio::test]
async fn refuses_to_continue_series_and_books_from_each_other_s_cursors() {
    let library = Library::with(&[
        series_holding("Sample Series 01", &["Volume 01", "Volume 02"]),
        SeriesSeed::named("Sample Series 02"),
    ])
    .await;
    let books = book_titles(series_id("Sample Series 01"));
    let by_title = library.page(series_titles(SeriesOrder::Title), None, 1);
    let title_cursor = by_title.await.unwrap().next;
    let books_cursor = library.page(books.clone(), None, 1).await.unwrap().next;

    let outcomes = [
        library.page(books, title_cursor, 1).await,
        library
            .page(series_titles(SeriesOrder::Title), books_cursor, 1)
            .await,
    ];

    for outcome in outcomes {
        assert!(matches!(outcome, Err(Error::CursorForAnotherList)));
    }
}

#[tokio::test]
async fn refuses_to_continue_one_series_books_from_another_series_cursor() {
    let library = Library::with(&[
        series_holding("Sample Series 01", &["Volume 01", "Volume 02"]),
        series_holding("Sample Series 02", &["Volume 01", "Volume 02"]),
    ])
    .await;
    let first_series = book_titles(series_id("Sample Series 01"));
    let first_series_cursor = library.page(first_series, None, 1).await.unwrap().next;

    let outcome = library
        .page(
            book_titles(series_id("Sample Series 02")),
            first_series_cursor,
            1,
        )
        .await;

    assert!(
        matches!(outcome, Err(Error::CursorForAnotherList)),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn refuses_to_continue_one_series_order_from_another_s_cursor() {
    let library = Library::with(&[
        SeriesSeed::named("Sample Series 01"),
        series_added_at("Sample Series 02", 2),
    ])
    .await;
    let by_title = library.page(series_titles(SeriesOrder::Title), None, 1);
    let title_cursor = by_title.await.unwrap().next;

    let outcome = library
        .page(series_titles(SeriesOrder::RecentlyAdded), title_cursor, 1)
        .await;

    assert!(matches!(outcome, Err(Error::CursorForAnotherList)));
}

#[test]
fn refuses_a_cursor_the_library_did_not_give_out() {
    let series =
        series_id("Sample Series 01")
            .as_bytes()
            .iter()
            .fold(String::new(), |mut hex, byte| {
                write!(hex, "{byte:02x}").unwrap();
                hex
            });
    let added_at = "00".repeat(8);
    let short_added = format!("02{added_at}{}", &series[2..]);
    let long_added = format!("02{added_at}{series}00");
    let underived_added = format!("02{added_at}{}", "00".repeat(16));
    let underived_book = format!("03{}", "00".repeat(32));
    let texts = [
        "",
        "0",
        "zz",
        "01",
        "0100",
        "ff00000000000000000000",
        &short_added,
        &long_added,
        &underived_added,
        &underived_book,
    ];

    let outcomes = texts.map(str::parse::<Cursor>);

    for (text, outcome) in texts.iter().zip(outcomes) {
        assert!(
            matches!(outcome, Err(Error::MalformedCursor)),
            "{text:?} gave {outcome:?}"
        );
    }
}

#[test]
fn holds_a_page_to_between_one_and_two_hundred_items() {
    let sizes = [0, 1, PageSize::MAX, PageSize::MAX + 1];

    let accepted = sizes.map(|size| PageSize::try_from(size).is_ok());

    assert_eq!(accepted, [false, true, true, false]);
}

fn series_id(folder_name: &str) -> SeriesId {
    NewSeries::local(folder_name, 0).unwrap().id()
}
