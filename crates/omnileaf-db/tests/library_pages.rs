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
        BookListing, BookReading, BooksShown, Cursor, NewSeries, Page, PageRequest, PageSize,
        SeriesFilter, SeriesListing, SeriesOrder, SeriesSort, SortDirection, series_books,
        series_count, series_page,
    },
};
use omnileaf_sync_proto::SeriesId;
use support::{ScratchFolder, library_config};

/// How often, in steps of SQLite's machine, a read checks in, and which check-in lets the rescan run, well after the read has begun.
const PROGRESS_STEPS: i32 = 10;
const RESCAN_AT_CHECK_IN: u32 = 2;
const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
const NEWEST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::DateAdded));

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
        let database = Database::open(&library_config(&folder)).unwrap();
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

fn series_titles(listing: SeriesListing) -> impl List + Clone {
    move |connection: &Connection, request: &PageRequest| {
        let page = series_page(connection, &listing, request)?;
        Ok(Page {
            items: page.items.into_iter().map(|series| series.title).collect(),
            next: page.next,
        })
    }
}

fn book_titles(series: SeriesId) -> impl List + Clone {
    listed_book_titles(series, BookListing::IN_ORDER)
}

fn listed_book_titles(series: SeriesId, listing: BookListing) -> impl List + Clone {
    move |connection: &Connection, request: &PageRequest| {
        let page = series_books(connection, series, listing, request)?;
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

    let pages = library.walk(series_titles(A_TO_Z), 2).await;

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

    let pages = library.walk(series_titles(NEWEST_FIRST), 2).await;

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

    let pages = library.walk(series_titles(NEWEST_FIRST), 2).await;

    assert_eq!(pages.concat(), expected);
}

#[tokio::test]
async fn ends_on_a_full_last_page_without_an_empty_one_after_it() {
    let library = Library::with(&[
        SeriesSeed::named("Sample Series 01"),
        SeriesSeed::named("Sample Series 02"),
    ])
    .await;

    let pages = library.walk(series_titles(A_TO_Z), 2).await;

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
        library.walk(series_titles(A_TO_Z), 10).await,
        library.walk(series_titles(NEWEST_FIRST), 10).await,
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

    let count = library
        .database
        .read(|connection| series_count(connection, &SeriesFilter::NONE))
        .await
        .unwrap();

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
            series_page(connection, &A_TO_Z, &request)
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
async fn pages_a_series_books_in_reverse_natural_order() {
    let library = Library::with(&[series_holding(
        "Sample Series 01",
        &["Volume 10", "Volume 2", "volume 1", "Extra"],
    )])
    .await;
    let reversed = BookListing {
        direction: SortDirection::Descending,
        ..BookListing::IN_ORDER
    };

    let pages = library
        .walk(
            listed_book_titles(series_id("Sample Series 01"), reversed),
            3,
        )
        .await;

    assert_eq!(
        pages,
        [vec!["Volume 10", "Volume 2", "volume 1"], vec!["Extra"]]
    );
}

#[tokio::test]
async fn pages_only_the_books_of_a_series_not_marked_read_either_way_round() {
    let library = Library::with(&[series_holding(
        "Sample Series 01",
        &[
            "Volume 01",
            "Volume 02",
            "Volume 03",
            "Volume 04",
            "Volume 05",
        ],
    )])
    .await;
    library
        .database
        .write(|transaction| {
            let mut state = transaction.prepare(
                "INSERT INTO book_state (book_id, is_read) SELECT id, ?2 FROM book WHERE title = ?1",
            )?;
            state.execute(("Volume 01", true))?;
            state.execute(("Volume 03", true))?;
            state.execute(("Volume 04", false))?;
            Ok(())
        })
        .await
        .unwrap();
    let series = series_id("Sample Series 01");
    let unread = |direction| BookListing {
        shown: BooksShown::Unread,
        direction,
    };

    let pages = [
        library
            .walk(
                listed_book_titles(series, unread(SortDirection::Ascending)),
                2,
            )
            .await,
        library
            .walk(
                listed_book_titles(series, unread(SortDirection::Descending)),
                2,
            )
            .await,
    ];

    assert_eq!(
        pages,
        [
            vec![vec!["Volume 02", "Volume 04"], vec!["Volume 05"]],
            vec![vec!["Volume 05", "Volume 04"], vec!["Volume 02"]],
        ]
    );
}

#[tokio::test]
async fn numbers_each_book_by_its_place_in_the_series_whichever_books_are_listed() {
    let library = Library::with(&[series_holding(
        "Sample Series 01",
        &["Volume 3", "Volume 1", "Volume 4", "Volume 2"],
    )])
    .await;
    library
        .database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read) SELECT id, 1 FROM book WHERE title = 'Volume 2'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let unread_last_first = BookListing {
        shown: BooksShown::Unread,
        direction: SortDirection::Descending,
    };

    let page = library
        .database
        .read(move |connection| {
            let request = PageRequest {
                after: None,
                size: PageSize::try_from(10).unwrap(),
            };
            series_books(
                connection,
                series_id("Sample Series 01"),
                unread_last_first,
                &request,
            )
        })
        .await
        .unwrap();

    let numbered: Vec<(&str, u32)> = page
        .items
        .iter()
        .map(|book| (book.title.as_str(), book.position))
        .collect();
    assert_eq!(
        numbered,
        [("Volume 4", 4), ("Volume 3", 3), ("Volume 1", 1)]
    );
}

#[tokio::test]
async fn reads_a_page_of_books_as_the_series_stood_though_a_book_goes_meanwhile() {
    let folder = ScratchFolder::new("books-read-whole");
    let config = library_config(&folder);
    let database = Database::open(&config).unwrap();
    seed_library(
        &database,
        &[series_holding(
            "Sample Series 01",
            &["Volume 01", "Volume 02", "Volume 03"],
        )],
    )
    .await;
    let path = config.path.clone();

    let page = database
        .read(move |connection| {
            let rescan = Connection::open(&path)?;
            load_schema(connection)?;
            let mut check_ins = 0;
            connection.progress_handler(
                PROGRESS_STEPS,
                Some(move || {
                    check_ins += 1;
                    if check_ins == RESCAN_AT_CHECK_IN {
                        rescan
                            .execute("DELETE FROM book WHERE title = 'Volume 02'", [])
                            .unwrap();
                    }
                    false
                }),
            )?;
            let request = PageRequest {
                after: None,
                size: PageSize::try_from(10).unwrap(),
            };
            let page = series_books(
                connection,
                series_id("Sample Series 01"),
                BookListing::IN_ORDER,
                &request,
            );
            connection.progress_handler(0, None::<fn() -> bool>)?;
            page
        })
        .await
        .unwrap();

    let titles: Vec<&str> = page.items.iter().map(|book| book.title.as_str()).collect();
    assert_eq!(titles, ["Volume 01", "Volume 02", "Volume 03"]);
}

#[tokio::test]
async fn tells_each_book_of_a_series_whether_it_is_read_started_or_not() {
    let library = Library::with(&[series_holding(
        "Sample Series 01",
        &[
            "Volume 01",
            "Volume 02",
            "Volume 03",
            "Volume 04",
            "Volume 05",
        ],
    )])
    .await;
    library
        .database
        .write(|transaction| {
            let mut state = transaction.prepare(
                "INSERT INTO book_state (book_id, position_page, furthest_page, is_read)
                SELECT book.id, ?2, ?3, ?4 FROM book WHERE book.title = ?1",
            )?;
            state.execute(("Volume 01", 30, 30, true))?;
            state.execute(("Volume 02", 4, None::<u32>, None::<bool>))?;
            state.execute(("Volume 03", None::<u32>, 9, false))?;
            state.execute(("Volume 04", None::<u32>, None::<u32>, false))?;
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
            series_books(
                connection,
                series_id("Sample Series 01"),
                BookListing::IN_ORDER,
                &request,
            )
        })
        .await
        .unwrap();

    let readings: Vec<BookReading> = page.items.iter().map(|book| book.reading).collect();
    assert_eq!(
        readings,
        [
            BookReading::Read,
            BookReading::Started {
                position_page: Some(4)
            },
            BookReading::Started {
                position_page: None
            },
            BookReading::NotStarted,
            BookReading::NotStarted,
        ]
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
    let by_title = library.page(series_titles(A_TO_Z), None, 1);
    let title_cursor = by_title.await.unwrap().next;
    let books_cursor = library.page(books.clone(), None, 1).await.unwrap().next;

    let outcomes = [
        library.page(books, title_cursor, 1).await,
        library.page(series_titles(A_TO_Z), books_cursor, 1).await,
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
async fn refuses_to_continue_a_series_books_in_another_listing_from_a_cursor() {
    let library = Library::with(&[series_holding(
        "Sample Series 01",
        &["Volume 01", "Volume 02", "Volume 03"],
    )])
    .await;
    let series = series_id("Sample Series 01");
    let in_order = listed_book_titles(series, BookListing::IN_ORDER);
    let cursor = library.page(in_order, None, 1).await.unwrap().next;
    let others = [
        BookListing {
            direction: SortDirection::Descending,
            ..BookListing::IN_ORDER
        },
        BookListing {
            shown: BooksShown::Unread,
            ..BookListing::IN_ORDER
        },
    ];

    for other in others {
        let outcome = library
            .page(listed_book_titles(series, other), cursor.clone(), 1)
            .await;

        assert!(
            matches!(outcome, Err(Error::CursorForAnotherList)),
            "{other:?}: {outcome:?}"
        );
    }
}

#[tokio::test]
async fn refuses_to_continue_one_series_order_from_another_s_cursor() {
    let library = Library::with(&[
        SeriesSeed::named("Sample Series 01"),
        series_added_at("Sample Series 02", 2),
    ])
    .await;
    let by_title = library.page(series_titles(A_TO_Z), None, 1);
    let title_cursor = by_title.await.unwrap().next;

    let outcome = library
        .page(series_titles(NEWEST_FIRST), title_cursor, 1)
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

/// Reads the schema in, so preparing the page's statements steps SQLite's machine no further.
fn load_schema(connection: &Connection) -> Result<(), Error> {
    connection.query_row("SELECT count(*) FROM book", [], |row| row.get::<_, i64>(0))?;
    Ok(())
}

fn series_id(folder_name: &str) -> SeriesId {
    NewSeries::local(folder_name, 0).unwrap().id()
}
