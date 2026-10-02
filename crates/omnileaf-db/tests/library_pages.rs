#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Connection, Database, Error,
    catalog::{
        Cursor, NewBook, NewSeries, Page, PageRequest, PageSize, SeriesOrder, add_book, add_series,
        series_books, series_page,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use support::ScratchFolder;

const ONE_BOOK: &[&str] = &["Volume 01"];
const NO_BOOKS: &[&str] = &[];

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with(series: &[(&str, i64, &[&str])]) -> Self {
        let folder = ScratchFolder::new("library-pages");
        let database = Database::open(&folder.config()).unwrap();
        let books: Vec<(NewSeries, Vec<NewBook>)> = series
            .iter()
            .map(|&(name, added_at_ms, titles)| new_series(name, added_at_ms, titles))
            .collect();
        database
            .write(move |transaction| {
                for (series, books) in &books {
                    add_series(transaction, series)?;
                    for book in books {
                        add_book(transaction, book)?;
                    }
                }
                Ok(())
            })
            .await
            .unwrap();
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
async fn pages_the_library_by_title_in_natural_order() {
    let library = Library::with(&[
        ("Sample Series 10", 1, ONE_BOOK),
        ("Sample Series 9", 1, ONE_BOOK),
        ("sample series 1", 1, ONE_BOOK),
        ("Example Series", 1, ONE_BOOK),
        ("Sample Series 2", 1, ONE_BOOK),
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
        ("Sample Series 01", 20, ONE_BOOK),
        ("Sample Series 02", 30, ONE_BOOK),
        ("Sample Series 03", 20, ONE_BOOK),
        ("Sample Series 04", 10, ONE_BOOK),
        ("Sample Series 05", 20, ONE_BOOK),
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
async fn ends_on_a_full_last_page_without_an_empty_one_after_it() {
    let library = Library::with(&[
        ("Sample Series 01", 1, ONE_BOOK),
        ("Sample Series 02", 1, ONE_BOOK),
    ])
    .await;

    let pages = library.walk(series_titles(SeriesOrder::Title), 2).await;

    assert_eq!(pages, [["Sample Series 01", "Sample Series 02"]]);
}

#[tokio::test]
async fn leaves_series_without_books_off_the_library_pages() {
    let library = Library::with(&[
        ("Sample Series 01", 1, NO_BOOKS),
        ("Sample Series 02", 2, ONE_BOOK),
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
async fn pages_a_series_books_in_natural_order() {
    let library = Library::with(&[
        (
            "Sample Series 01",
            1,
            &["Volume 10", "Volume 2", "volume 1", "Extra"],
        ),
        ("Sample Series 02", 1, &["Volume 3"]),
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
    let library = Library::with(&[("Sample Series 01", 1, ONE_BOOK)]).await;

    let pages = library
        .walk(book_titles(series_id("Sample Series 09")), 3)
        .await;

    assert_eq!(pages, [Vec::<String>::new()]);
}

#[tokio::test]
async fn refuses_to_continue_series_and_books_from_each_other_s_cursors() {
    let library = Library::with(&[
        ("Sample Series 01", 1, &["Volume 01", "Volume 02"]),
        ("Sample Series 02", 1, ONE_BOOK),
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
async fn refuses_to_continue_one_series_order_from_another_s_cursor() {
    let library = Library::with(&[
        ("Sample Series 01", 1, ONE_BOOK),
        ("Sample Series 02", 2, ONE_BOOK),
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
    let short_added = format!("02{}", "00".repeat(15));
    let long_added = format!("02{}", "00".repeat(17));
    let underived_book = format!("03{}", "00".repeat(16));
    let texts = [
        "",
        "0",
        "zz",
        "01",
        "0100",
        "ff00000000000000000000",
        &short_added,
        &long_added,
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

fn new_series(name: &str, added_at_ms: i64, titles: &[&str]) -> (NewSeries, Vec<NewBook>) {
    let series = NewSeries::local(name, added_at_ms).unwrap();
    let books = titles
        .iter()
        .map(|&title| NewBook {
            id: book_id(name, title),
            series: series.id(),
            title: title.to_owned(),
            added_at_ms,
        })
        .collect();
    (series, books)
}

fn book_id(series: &str, title: &str) -> BookId {
    let name = format!("{series}/{title}");
    let pages = name.bytes().zip(0..).map(|(byte, crc32)| ImageEntry {
        crc32,
        size: u64::from(byte),
    });
    BookId::local(&Fingerprint::pmf1(pages).unwrap())
}
