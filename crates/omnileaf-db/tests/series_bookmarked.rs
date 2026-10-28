#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::Database;
use proptest::{collection::vec, prelude::*};
use rusqlite::Connection;
use support::{ScratchFolder, library_config};

const SERIES_TITLES: [&str; 2] = ["Sample Series 01", "Sample Series 02"];
const BOOK_TITLES: &[&str] = &["Volume 01", "Volume 02", "Volume 03"];
const BOOKMARKED_BOOKS_OF_EACH_SERIES: &str =
    "SELECT title, bookmarked_books FROM series ORDER BY title";
const BOOKMARKED_BOOKS_COUNTED_AGAIN: &str = "SELECT series.title, count(DISTINCT book.id)
    FROM series
    LEFT JOIN book ON book.series_local_id = series.local_id
        AND EXISTS (SELECT 1 FROM book_bookmark WHERE book_bookmark.book_id = book.id)
    GROUP BY series.title ORDER BY series.title";

type Row = (String, i64);

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books() -> Self {
        let folder = ScratchFolder::new("series-bookmarked");
        let database = Database::open(&library_config(&folder)).unwrap();
        let series: Vec<SeriesSeed<'_>> = SERIES_TITLES
            .iter()
            .map(|&name| SeriesSeed {
                book_titles: BOOK_TITLES,
                ..SeriesSeed::named(name)
            })
            .collect();
        seed_library(&database, &series).await;
        Self {
            database,
            _folder: folder,
        }
    }

    async fn run(&self, sql: &'static str, params: Vec<String>) {
        self.database
            .write(move |transaction| {
                transaction.execute(sql, rusqlite::params_from_iter(params))?;
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn bookmark(&self, series: &str, book: &str, page: u32) {
        self.run(
            "INSERT OR IGNORE INTO book_bookmark (book_id, page)
            SELECT book.id, ?3 FROM book
            JOIN series ON series.local_id = book.series_local_id
            WHERE series.title = ?1 AND book.title = ?2",
            vec![series.to_owned(), book.to_owned(), page.to_string()],
        )
        .await;
    }

    async fn unbookmark(&self, series: &str, book: &str, page: u32) {
        self.run(
            "DELETE FROM book_bookmark WHERE page = ?3 AND book_id = (
                SELECT book.id FROM book
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = ?2)",
            vec![series.to_owned(), book.to_owned(), page.to_string()],
        )
        .await;
    }

    async fn remove(&self, series: &str, book: &str) {
        self.run(
            "DELETE FROM book WHERE title = ?2 AND series_local_id =
                (SELECT local_id FROM series WHERE title = ?1)",
            vec![series.to_owned(), book.to_owned()],
        )
        .await;
    }

    async fn move_to(&self, from: &str, book: &str, to: &str) {
        self.run(
            "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?3)
            WHERE title = ?2 AND series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                AND NOT EXISTS (SELECT 1 FROM book AS twin WHERE twin.title = ?2
                    AND twin.series_local_id = (SELECT local_id FROM series WHERE title = ?3))",
            vec![from.to_owned(), book.to_owned(), to.to_owned()],
        )
        .await;
    }

    async fn rows(&self, sql: &'static str) -> Vec<Row> {
        self.database
            .read(move |connection: &Connection| {
                Ok(connection
                    .prepare(sql)?
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<_, _>>()?)
            })
            .await
            .unwrap()
    }

    async fn bookmarked_books(&self) -> Vec<Row> {
        self.rows(BOOKMARKED_BOOKS_OF_EACH_SERIES).await
    }
}

fn row(series: &str, bookmarked_books: i64) -> Row {
    (series.to_owned(), bookmarked_books)
}

#[tokio::test]
async fn counts_the_books_of_a_series_holding_a_bookmark_once_however_many_they_hold() {
    let library = Library::with_books().await;

    library.bookmark(SERIES_TITLES[0], "Volume 01", 1).await;
    library.bookmark(SERIES_TITLES[0], "Volume 01", 4).await;
    library.bookmark(SERIES_TITLES[0], "Volume 02", 1).await;

    assert_eq!(
        library.bookmarked_books().await,
        [row(SERIES_TITLES[0], 2), row(SERIES_TITLES[1], 0)]
    );
}

#[tokio::test]
async fn stops_counting_a_book_once_its_last_bookmark_is_taken_off() {
    let library = Library::with_books().await;
    library.bookmark(SERIES_TITLES[0], "Volume 01", 1).await;
    library.bookmark(SERIES_TITLES[0], "Volume 01", 4).await;

    library.unbookmark(SERIES_TITLES[0], "Volume 01", 1).await;
    let with_one_left = library.bookmarked_books().await;
    library.unbookmark(SERIES_TITLES[0], "Volume 01", 4).await;

    assert_eq!(
        (with_one_left, library.bookmarked_books().await),
        (
            vec![row(SERIES_TITLES[0], 1), row(SERIES_TITLES[1], 0)],
            vec![row(SERIES_TITLES[0], 0), row(SERIES_TITLES[1], 0)]
        )
    );
}

#[tokio::test]
async fn moves_a_bookmarked_book_s_count_to_the_series_it_moves_to_and_drops_it_with_the_book() {
    let library = Library::with_books().await;
    library.bookmark(SERIES_TITLES[0], "Volume 01", 1).await;
    library.bookmark(SERIES_TITLES[0], "Volume 02", 1).await;

    library.remove(SERIES_TITLES[1], "Volume 01").await;

    library
        .move_to(SERIES_TITLES[0], "Volume 01", SERIES_TITLES[1])
        .await;
    let after_move = library.bookmarked_books().await;
    library.remove(SERIES_TITLES[0], "Volume 02").await;

    assert_eq!(
        (after_move, library.bookmarked_books().await),
        (
            vec![row(SERIES_TITLES[0], 1), row(SERIES_TITLES[1], 1)],
            vec![row(SERIES_TITLES[0], 0), row(SERIES_TITLES[1], 1)]
        )
    );
}

#[derive(Clone, Debug)]
enum Change {
    Bookmark { book: usize, page: u32 },
    Unbookmark { book: usize, page: u32 },
    Move { book: usize, series: usize },
    Remove { book: usize },
}

fn change() -> impl Strategy<Value = Change> {
    let book = 0..BOOK_TITLES.len() * SERIES_TITLES.len();
    prop_oneof![
        (book.clone(), 0_u32..3).prop_map(|(book, page)| Change::Bookmark { book, page }),
        (book.clone(), 0_u32..3).prop_map(|(book, page)| Change::Unbookmark { book, page }),
        (book.clone(), 0..SERIES_TITLES.len())
            .prop_map(|(book, series)| Change::Move { book, series }),
        book.prop_map(|book| Change::Remove { book }),
    ]
}

fn book_of(index: usize) -> (&'static str, &'static str) {
    (
        SERIES_TITLES.get(index / BOOK_TITLES.len()).unwrap(),
        BOOK_TITLES.get(index % BOOK_TITLES.len()).unwrap(),
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    #[test]
    fn counts_the_same_bookmarked_books_as_counting_every_book_again(changes in vec(change(), 0..24)) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let (kept, counted_again) = runtime.block_on(async {
            let library = Library::with_books().await;
            for change in changes {
                match change {
                    Change::Bookmark { book, page } => {
                        let (series, title) = book_of(book);
                        library.bookmark(series, title, page).await;
                    }
                    Change::Unbookmark { book, page } => {
                        let (series, title) = book_of(book);
                        library.unbookmark(series, title, page).await;
                    }
                    Change::Move { book, series } => {
                        let (from, title) = book_of(book);
                        library.move_to(from, title, SERIES_TITLES.get(series).unwrap()).await;
                    }
                    Change::Remove { book } => {
                        let (series, title) = book_of(book);
                        library.remove(series, title).await;
                    }
                }
            }
            (
                library.bookmarked_books().await,
                library.rows(BOOKMARKED_BOOKS_COUNTED_AGAIN).await,
            )
        });

        prop_assert_eq!(kept, counted_again);
    }
}
