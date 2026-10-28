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
const TAGS_OF_EACH_SERIES: &str = "SELECT series.title, series_tag.name, series_tag.book_count
    FROM series_tag JOIN series ON series.local_id = series_tag.series_local_id
    ORDER BY series.title, series_tag.name";
const TAGS_COUNTED_AGAIN: &str = "SELECT series.title, book_tag.name, count(DISTINCT book.id)
    FROM book_tag
    JOIN book ON book.id = book_tag.book_id
    JOIN series ON series.local_id = book.series_local_id
    GROUP BY series.title, book_tag.name
    ORDER BY series.title, book_tag.name";

type Row = (String, String, i64);

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books() -> Self {
        let folder = ScratchFolder::new("series-tags");
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

    async fn tag(&self, series: &str, book: &str, kind: &str, name: &str) {
        self.run(
            "INSERT OR IGNORE INTO book_details (book_id)
            SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
            WHERE series.title = ?1 AND book.title = ?2",
            vec![series.to_owned(), book.to_owned()],
        )
        .await;
        self.run(
            "INSERT OR IGNORE INTO book_tag (book_id, kind, name)
            SELECT book.id, ?3, ?4 FROM book JOIN series ON series.local_id = book.series_local_id
            WHERE series.title = ?1 AND book.title = ?2",
            vec![
                series.to_owned(),
                book.to_owned(),
                kind.to_owned(),
                name.to_owned(),
            ],
        )
        .await;
    }

    async fn untag(&self, series: &str, book: &str, kind: &str, name: &str) {
        self.run(
            "DELETE FROM book_tag WHERE kind = ?3 AND name = ?4 AND book_id = (
                SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = ?2)",
            vec![
                series.to_owned(),
                book.to_owned(),
                kind.to_owned(),
                name.to_owned(),
            ],
        )
        .await;
    }

    async fn tags(&self) -> Vec<Row> {
        self.rows(TAGS_OF_EACH_SERIES).await
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

fn row(series: &str, name: &str, book_count: i64) -> Row {
    (series.to_owned(), name.to_owned(), book_count)
}

#[tokio::test]
async fn counts_the_books_of_a_series_carrying_each_tag_once_whatever_their_kinds() {
    let library = Library::with_books().await;

    library
        .tag(SERIES_TITLES[0], "Volume 01", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 01", "genre", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 02", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[1], "Volume 01", "genre", "harbour")
        .await;

    assert_eq!(
        library.tags().await,
        [
            row(SERIES_TITLES[0], "storms", 2),
            row(SERIES_TITLES[1], "harbour", 1),
        ]
    );
}

#[tokio::test]
async fn keeps_a_tag_while_one_of_its_books_still_carries_it_under_any_kind() {
    let library = Library::with_books().await;
    library
        .tag(SERIES_TITLES[0], "Volume 01", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 01", "genre", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 02", "tag", "storms")
        .await;

    library
        .untag(SERIES_TITLES[0], "Volume 01", "tag", "storms")
        .await;
    let still_counted = library.tags().await;
    library
        .untag(SERIES_TITLES[0], "Volume 01", "genre", "storms")
        .await;
    let after_that_book = library.tags().await;
    library
        .untag(SERIES_TITLES[0], "Volume 02", "tag", "storms")
        .await;

    assert_eq!(
        (still_counted, after_that_book, library.tags().await),
        (
            vec![row(SERIES_TITLES[0], "storms", 2)],
            vec![row(SERIES_TITLES[0], "storms", 1)],
            Vec::new()
        )
    );
}

#[tokio::test]
async fn moves_a_book_s_tags_to_the_series_it_moves_to() {
    let library = Library::with_books().await;
    library
        .tag(SERIES_TITLES[0], "Volume 01", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 02", "tag", "storms")
        .await;

    library
        .run(
            "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE title = ?2)
            WHERE series_local_id = (SELECT local_id FROM series WHERE title = ?1)
                AND title = 'Volume 01'",
            vec![SERIES_TITLES[0].to_owned(), SERIES_TITLES[1].to_owned()],
        )
        .await;

    assert_eq!(
        library.tags().await,
        [
            row(SERIES_TITLES[0], "storms", 1),
            row(SERIES_TITLES[1], "storms", 1),
        ]
    );
}

#[tokio::test]
async fn drops_a_book_s_tags_with_the_book_and_a_series_tags_with_the_series() {
    let library = Library::with_books().await;
    library
        .tag(SERIES_TITLES[0], "Volume 01", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[0], "Volume 02", "tag", "storms")
        .await;
    library
        .tag(SERIES_TITLES[1], "Volume 01", "tag", "harbour")
        .await;

    library
        .run(
            "DELETE FROM book WHERE title = 'Volume 01' AND series_local_id =
                (SELECT local_id FROM series WHERE title = ?1)",
            vec![SERIES_TITLES[0].to_owned()],
        )
        .await;
    let after_a_book = library.tags().await;
    library
        .run(
            "DELETE FROM series WHERE title = ?1",
            vec![SERIES_TITLES[0].to_owned()],
        )
        .await;

    assert_eq!(
        (after_a_book, library.tags().await),
        (
            vec![
                row(SERIES_TITLES[0], "storms", 1),
                row(SERIES_TITLES[1], "harbour", 1),
            ],
            vec![row(SERIES_TITLES[1], "harbour", 1)]
        )
    );
}

#[derive(Clone, Debug)]
enum Change {
    Tag {
        book: usize,
        genre: bool,
        name: usize,
    },
    Untag {
        book: usize,
        genre: bool,
        name: usize,
    },
    Move {
        book: usize,
        series: usize,
    },
    Remove {
        book: usize,
    },
}

fn change() -> impl Strategy<Value = Change> {
    let book = 0..BOOK_TITLES.len() * SERIES_TITLES.len();
    prop_oneof![
        (book.clone(), any::<bool>(), 0..2_usize).prop_map(|(book, genre, name)| Change::Tag {
            book,
            genre,
            name
        }),
        (book.clone(), any::<bool>(), 0..2_usize).prop_map(|(book, genre, name)| Change::Untag {
            book,
            genre,
            name
        }),
        (book.clone(), 0..SERIES_TITLES.len())
            .prop_map(|(book, series)| Change::Move { book, series }),
        book.prop_map(|book| Change::Remove { book }),
    ]
}

const NAMES: [&str; 2] = ["storms", "harbour"];

fn book_of(index: usize) -> (&'static str, &'static str) {
    (
        SERIES_TITLES.get(index / BOOK_TITLES.len()).unwrap(),
        BOOK_TITLES.get(index % BOOK_TITLES.len()).unwrap(),
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    #[test]
    fn counts_the_same_tags_as_counting_every_book_again(changes in vec(change(), 0..24)) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let (kept, counted_again) = runtime.block_on(async {
            let library = Library::with_books().await;
            for change in changes {
                match change {
                    Change::Tag { book, genre, name } => {
                        let (series, title) = book_of(book);
                        library.tag(series, title, if genre { "genre" } else { "tag" }, NAMES.get(name).unwrap()).await;
                    }
                    Change::Untag { book, genre, name } => {
                        let (series, title) = book_of(book);
                        library.untag(series, title, if genre { "genre" } else { "tag" }, NAMES.get(name).unwrap()).await;
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
            (library.tags().await, library.rows(TAGS_COUNTED_AGAIN).await)
        });

        prop_assert_eq!(kept, counted_again);
    }
}
