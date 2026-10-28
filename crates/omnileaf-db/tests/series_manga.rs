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
const MANGA_BOOKS_OF_EACH_SERIES: &str = "SELECT title, manga_books, 0 FROM series ORDER BY title";
const MANGA_BOOKS_COUNTED_AGAIN: &str = "SELECT series.title, count(manga_book.book_id), 0
    FROM series LEFT JOIN manga_book ON manga_book.series_local_id = series.local_id
    GROUP BY series.title ORDER BY series.title";

type Row = (String, i64, i64);

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books() -> Self {
        let folder = ScratchFolder::new("series-manga");
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

    async fn mark(&self, series: &str, book: &str, is_manga: Option<bool>) {
        let value = is_manga.map(|is_manga| if is_manga { "1" } else { "0" }.to_owned());
        self.database
            .write({
                let (series, book) = (series.to_owned(), book.to_owned());
                move |transaction| {
                    transaction.execute(
                        "INSERT INTO book_details (book_id, is_manga)
                        SELECT book.id, ?3 FROM book
                        JOIN series ON series.local_id = book.series_local_id
                        WHERE series.title = ?1 AND book.title = ?2
                        ON CONFLICT (book_id) DO UPDATE SET is_manga = excluded.is_manga",
                        (series, book, value),
                    )?;
                    Ok(())
                }
            })
            .await
            .unwrap();
    }

    async fn manga_books(&self) -> Vec<Row> {
        self.rows(MANGA_BOOKS_OF_EACH_SERIES).await
    }

    async fn rows(&self, sql: &'static str) -> Vec<Row> {
        self.database
            .read(move |connection: &Connection| {
                Ok(connection
                    .prepare(sql)?
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                    .collect::<Result<_, _>>()?)
            })
            .await
            .unwrap()
    }
}

fn row(series: &str, manga_books: i64) -> Row {
    (series.to_owned(), manga_books, 0)
}

#[tokio::test]
async fn counts_the_books_of_a_series_whose_files_say_they_are_manga() {
    let library = Library::with_books().await;

    library
        .mark(SERIES_TITLES[0], "Volume 01", Some(true))
        .await;
    library
        .mark(SERIES_TITLES[0], "Volume 02", Some(true))
        .await;
    library
        .mark(SERIES_TITLES[0], "Volume 03", Some(false))
        .await;
    library.mark(SERIES_TITLES[1], "Volume 01", None).await;

    assert_eq!(
        library.manga_books().await,
        [row(SERIES_TITLES[0], 2), row(SERIES_TITLES[1], 0)]
    );
}

#[tokio::test]
async fn follows_a_book_whose_manga_value_changes_or_whose_details_go() {
    let library = Library::with_books().await;
    library
        .mark(SERIES_TITLES[0], "Volume 01", Some(true))
        .await;
    library
        .mark(SERIES_TITLES[0], "Volume 02", Some(true))
        .await;

    library
        .mark(SERIES_TITLES[0], "Volume 01", Some(false))
        .await;
    let after_unmarking = library.manga_books().await;
    library
        .mark(SERIES_TITLES[0], "Volume 01", Some(true))
        .await;
    library
        .run(
            "DELETE FROM book_details WHERE book_id = (
                SELECT book.id FROM book WHERE book.title = 'Volume 02'
                    AND series_local_id = (SELECT local_id FROM series WHERE title = ?1))",
            vec![SERIES_TITLES[0].to_owned()],
        )
        .await;

    assert_eq!(
        (after_unmarking, library.manga_books().await),
        (
            vec![row(SERIES_TITLES[0], 1), row(SERIES_TITLES[1], 0)],
            vec![row(SERIES_TITLES[0], 1), row(SERIES_TITLES[1], 0)]
        )
    );
}

#[tokio::test]
async fn moves_a_manga_book_s_count_to_the_series_it_moves_to_and_drops_it_with_the_book() {
    let library = Library::with_books().await;
    library
        .mark(SERIES_TITLES[0], "Volume 01", Some(true))
        .await;
    library
        .mark(SERIES_TITLES[0], "Volume 02", Some(true))
        .await;

    library
        .run(
            "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?2)
            WHERE series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                AND title = 'Volume 01'",
            vec![SERIES_TITLES[0].to_owned(), SERIES_TITLES[1].to_owned()],
        )
        .await;
    let after_move = library.manga_books().await;
    library
        .run(
            "DELETE FROM book WHERE title = 'Volume 02' AND series_local_id =
                (SELECT local_id FROM series WHERE title = ?1)",
            vec![SERIES_TITLES[0].to_owned()],
        )
        .await;

    assert_eq!(
        (after_move, library.manga_books().await),
        (
            vec![row(SERIES_TITLES[0], 1), row(SERIES_TITLES[1], 1)],
            vec![row(SERIES_TITLES[0], 0), row(SERIES_TITLES[1], 1)]
        )
    );
}

#[derive(Clone, Debug)]
enum Change {
    Mark { book: usize, is_manga: Option<bool> },
    Forget { book: usize },
    Move { book: usize, series: usize },
    Remove { book: usize },
}

fn change() -> impl Strategy<Value = Change> {
    let book = 0..BOOK_TITLES.len() * SERIES_TITLES.len();
    prop_oneof![
        (book.clone(), proptest::option::of(any::<bool>()))
            .prop_map(|(book, is_manga)| Change::Mark { book, is_manga }),
        book.clone().prop_map(|book| Change::Forget { book }),
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
    fn counts_the_same_manga_books_as_counting_every_book_again(changes in vec(change(), 0..24)) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let (kept, counted_again) = runtime.block_on(async {
            let library = Library::with_books().await;
            for change in changes {
                match change {
                    Change::Mark { book, is_manga } => {
                        let (series, title) = book_of(book);
                        library.mark(series, title, is_manga).await;
                    }
                    Change::Forget { book } => {
                        let (series, title) = book_of(book);
                        library.run(
                            "DELETE FROM book_details WHERE book_id = (
                                SELECT book.id FROM book WHERE book.title = ?2
                                    AND series_local_id = (SELECT local_id FROM series WHERE title = ?1))",
                            vec![series.to_owned(), title.to_owned()],
                        ).await;
                    }
                    Change::Move { book, series } => {
                        let (from, title) = book_of(book);
                        library.run(
                            "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?3)
                            WHERE title = ?2 AND series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                                AND NOT EXISTS (SELECT 1 FROM book AS twin WHERE twin.title = ?2
                                    AND twin.series_local_id = (SELECT local_id FROM series WHERE title = ?3))",
                            vec![from.to_owned(), title.to_owned(), (*SERIES_TITLES.get(series).unwrap()).to_owned()],
                        ).await;
                    }
                    Change::Remove { book } => {
                        let (series, title) = book_of(book);
                        library.run(
                            "DELETE FROM book WHERE title = ?2 AND series_local_id =
                                (SELECT local_id FROM series WHERE title = ?1)",
                            vec![series.to_owned(), title.to_owned()],
                        ).await;
                    }
                }
            }
            (library.manga_books().await, library.rows(MANGA_BOOKS_COUNTED_AGAIN).await)
        });

        prop_assert_eq!(kept, counted_again);
    }
}
