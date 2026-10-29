#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use std::path::PathBuf;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    catalog::{NewRoot, RootKind, RootLocator, add_root},
};
use proptest::{collection::vec, prelude::*};
use rusqlite::Connection;
use support::{ScratchFolder, library_config};

const SERIES_TITLES: [&str; 2] = ["Sample Series 01", "Sample Series 02"];
const BOOK_TITLES: &[&str] = &["Volume 01", "Volume 02", "Volume 03"];
const COVER_FILE_OF_EACH_SERIES: &str = "SELECT title, cover_file_id FROM series ORDER BY title";
const COVER_FILE_CHOSEN_AGAIN: &str = "SELECT series.title, (
        SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
        FROM book
        WHERE book.series_local_id = series.local_id
            AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
        ORDER BY book.reading_order_key, book.id
        LIMIT 1
    ) FROM series ORDER BY series.title";
const FILE_OF_BOOK: &str = "SELECT book_file.id FROM book_file
    JOIN book ON book.id = book_file.book_id
    JOIN series ON series.local_id = book.series_local_id
    WHERE series.title = ?1 AND book.title = ?2 ORDER BY book_file.id";

type Cover = (String, Option<i64>);

struct Library {
    database: Database,
    files_added: usize,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books() -> Self {
        let folder = ScratchFolder::new("series-cover");
        let database = Database::open(&library_config(&folder)).unwrap();
        let series: Vec<SeriesSeed<'_>> = SERIES_TITLES
            .iter()
            .map(|&name| SeriesSeed {
                book_titles: BOOK_TITLES,
                ..SeriesSeed::named(name)
            })
            .collect();
        seed_library(&database, &series).await;
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Sample Library")),
            added_at_ms: 1,
        };
        database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            database,
            files_added: 0,
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

    async fn add_file(&mut self, series: &str, book: &str) {
        self.files_added += 1;
        self.run(
            "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
            SELECT book.id, (SELECT min(id) FROM library_root), CAST(?3 AS BLOB), 1, 1
            FROM book JOIN series ON series.local_id = book.series_local_id
            WHERE series.title = ?1 AND book.title = ?2",
            vec![
                series.to_owned(),
                book.to_owned(),
                format!("file {}", self.files_added),
            ],
        )
        .await;
    }

    async fn remove_first_file(&self, series: &str, book: &str) {
        self.run(
            "DELETE FROM book_file WHERE id = (
                SELECT min(book_file.id) FROM book_file
                JOIN book ON book.id = book_file.book_id
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = ?2)",
            vec![series.to_owned(), book.to_owned()],
        )
        .await;
    }

    async fn move_last_file(&self, from: (&str, &str), to: (&str, &str)) {
        self.run(
            "UPDATE book_file SET book_id = target.id FROM (
                SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?3 AND book.title = ?4) AS target
            WHERE book_file.id = (
                SELECT max(book_file.id) FROM book_file
                JOIN book ON book.id = book_file.book_id
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = ?2)",
            vec![
                from.0.to_owned(),
                from.1.to_owned(),
                to.0.to_owned(),
                to.1.to_owned(),
            ],
        )
        .await;
    }

    async fn move_book(&self, from: (&str, &str), to_series: &str) {
        self.run(
            "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?3)
            WHERE title = ?2 AND series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                AND NOT EXISTS (SELECT 1 FROM book AS twin WHERE twin.title = ?2
                    AND twin.series_local_id = (SELECT local_id FROM series WHERE title = ?3))",
            vec![from.0.to_owned(), from.1.to_owned(), to_series.to_owned()],
        )
        .await;
    }

    async fn reorder(&self, series: &str, book: &str, key: &str) {
        self.run(
            "UPDATE book SET reading_order_key = CAST(?3 AS BLOB)
            WHERE title = ?2 AND series_local_id = (SELECT local_id FROM series WHERE title = ?1)",
            vec![series.to_owned(), book.to_owned(), key.to_owned()],
        )
        .await;
    }

    async fn remove_book(&self, series: &str, book: &str) {
        self.run(
            "DELETE FROM book WHERE title = ?2 AND series_local_id =
                (SELECT local_id FROM series WHERE title = ?1)",
            vec![series.to_owned(), book.to_owned()],
        )
        .await;
    }

    async fn file_of(&self, series: &'static str, book: &'static str) -> Option<i64> {
        self.database
            .read(move |connection: &Connection| {
                Ok(connection
                    .prepare(FILE_OF_BOOK)?
                    .query_map([series, book], |row| row.get(0))?
                    .next()
                    .transpose()?)
            })
            .await
            .unwrap()
    }

    async fn kept(&self) -> Vec<Cover> {
        self.covers(COVER_FILE_OF_EACH_SERIES).await
    }

    async fn chosen_again(&self) -> Vec<Cover> {
        self.covers(COVER_FILE_CHOSEN_AGAIN).await
    }

    async fn covers(&self, sql: &'static str) -> Vec<Cover> {
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
}

fn cover(series: &str, file: Option<i64>) -> Cover {
    (series.to_owned(), file)
}

#[tokio::test]
async fn takes_the_first_book_that_has_a_file_when_the_first_book_has_none() {
    let mut library = Library::with_books().await;

    library.add_file(SERIES_TITLES[0], "Volume 02").await;
    library.add_file(SERIES_TITLES[0], "Volume 03").await;

    let file = library.file_of(SERIES_TITLES[0], "Volume 02").await;
    assert_eq!(
        library.kept().await,
        [cover(SERIES_TITLES[0], file), cover(SERIES_TITLES[1], None)]
    );
}

#[tokio::test]
async fn moves_to_an_earlier_book_that_gains_a_file_and_back_when_it_loses_it() {
    let mut library = Library::with_books().await;
    library.add_file(SERIES_TITLES[0], "Volume 02").await;
    let later = library.file_of(SERIES_TITLES[0], "Volume 02").await;

    library.add_file(SERIES_TITLES[0], "Volume 01").await;
    let earlier = library.file_of(SERIES_TITLES[0], "Volume 01").await;
    let with_both = library.kept().await;
    library
        .remove_first_file(SERIES_TITLES[0], "Volume 01")
        .await;

    assert_eq!(with_both[0], cover(SERIES_TITLES[0], earlier));
    assert_eq!(library.kept().await[0], cover(SERIES_TITLES[0], later));
}

#[tokio::test]
async fn follows_a_book_that_is_removed_or_moved_to_another_series() {
    let mut library = Library::with_books().await;
    library.add_file(SERIES_TITLES[0], "Volume 01").await;
    library.add_file(SERIES_TITLES[0], "Volume 02").await;
    let second = library.file_of(SERIES_TITLES[0], "Volume 02").await;
    let first = library.file_of(SERIES_TITLES[0], "Volume 01").await;

    library.remove_book(SERIES_TITLES[1], "Volume 01").await;

    library
        .move_book((SERIES_TITLES[0], "Volume 01"), SERIES_TITLES[1])
        .await;
    let after_move = library.kept().await;
    library.remove_book(SERIES_TITLES[0], "Volume 02").await;

    assert_eq!(
        after_move,
        [
            cover(SERIES_TITLES[0], second),
            cover(SERIES_TITLES[1], first)
        ]
    );
    assert_eq!(
        library.kept().await,
        [
            cover(SERIES_TITLES[0], None),
            cover(SERIES_TITLES[1], first)
        ]
    );
}

#[tokio::test]
async fn follows_a_book_that_is_reordered() {
    let mut library = Library::with_books().await;
    library.add_file(SERIES_TITLES[0], "Volume 01").await;
    library.add_file(SERIES_TITLES[0], "Volume 02").await;
    let second = library.file_of(SERIES_TITLES[0], "Volume 02").await;

    library.reorder(SERIES_TITLES[0], "Volume 02", "").await;

    assert_eq!(library.kept().await[0], cover(SERIES_TITLES[0], second));
}

#[derive(Clone, Debug)]
enum Change {
    AddFile { book: usize },
    RemoveFile { book: usize },
    MoveFile { from: usize, to: usize },
    MoveBook { book: usize, series: usize },
    Reorder { book: usize, key: usize },
    RemoveBook { book: usize },
}

fn change() -> impl Strategy<Value = Change> {
    let book = 0..BOOK_TITLES.len() * SERIES_TITLES.len();
    prop_oneof![
        3 => book.clone().prop_map(|book| Change::AddFile { book }),
        2 => book.clone().prop_map(|book| Change::RemoveFile { book }),
        1 => (book.clone(), book.clone()).prop_map(|(from, to)| Change::MoveFile { from, to }),
        1 => (book.clone(), 0..SERIES_TITLES.len())
            .prop_map(|(book, series)| Change::MoveBook { book, series }),
        1 => (book.clone(), 0..KEYS.len()).prop_map(|(book, key)| Change::Reorder { book, key }),
        1 => book.prop_map(|book| Change::RemoveBook { book }),
    ]
}

const KEYS: [&str; 3] = ["", "Volume 02", "Volume 99"];

fn book_of(index: usize) -> (&'static str, &'static str) {
    (
        SERIES_TITLES.get(index / BOOK_TITLES.len()).unwrap(),
        BOOK_TITLES.get(index % BOOK_TITLES.len()).unwrap(),
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn keeps_the_same_cover_as_choosing_it_again_for_every_series(changes in vec(change(), 0..32)) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let (kept, chosen_again) = runtime.block_on(async {
            let mut library = Library::with_books().await;
            for change in changes {
                match change {
                    Change::AddFile { book } => {
                        let (series, title) = book_of(book);
                        library.add_file(series, title).await;
                    }
                    Change::RemoveFile { book } => {
                        let (series, title) = book_of(book);
                        library.remove_first_file(series, title).await;
                    }
                    Change::MoveFile { from, to } => {
                        library.move_last_file(book_of(from), book_of(to)).await;
                    }
                    Change::MoveBook { book, series } => {
                        library.move_book(book_of(book), SERIES_TITLES.get(series).unwrap()).await;
                    }
                    Change::Reorder { book, key } => {
                        let (series, title) = book_of(book);
                        library.reorder(series, title, KEYS.get(key).unwrap()).await;
                    }
                    Change::RemoveBook { book } => {
                        let (series, title) = book_of(book);
                        library.remove_book(series, title).await;
                    }
                }
            }
            (library.kept().await, library.chosen_again().await)
        });

        prop_assert_eq!(kept, chosen_again);
    }
}
