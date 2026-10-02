#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database, Error,
    catalog::{NewBook, NewSeries, add_book, add_series},
    rusqlite::{self, ErrorCode},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;

#[tokio::test]
async fn counts_the_books_added_to_a_series() {
    let folder = ScratchFolder::new("count-books");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;

    add_books(&database, series, 2).await.unwrap();

    assert_eq!(book_count(&database, series).await, 2);
}

#[tokio::test]
async fn counts_a_book_out_once_it_is_removed() {
    let folder = ScratchFolder::new("uncount-books");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;
    add_books(&database, series, 2).await.unwrap();

    remove_book(&database, book_id(series, 0)).await;

    assert_eq!(book_count(&database, series).await, 1);
}

#[tokio::test]
async fn moves_the_count_with_a_book_moved_to_another_series() {
    let folder = ScratchFolder::new("move-book");
    let database = Database::open(&folder.config()).unwrap();
    let from = add_local_series(&database, "Sample Series 01").await;
    let to = add_local_series(&database, "Sample Series 02").await;
    add_books(&database, from, 2).await.unwrap();

    database
        .write(move |transaction| {
            Ok(transaction.execute(
                "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE id = ?1)
                 WHERE id = ?2",
                (to.as_bytes(), book_id(from, 0).as_bytes()),
            )?)
        })
        .await
        .unwrap();

    assert_eq!(
        (
            book_count(&database, from).await,
            book_count(&database, to).await
        ),
        (1, 1)
    );
}

#[tokio::test]
async fn refuses_a_book_for_a_series_missing_from_the_catalog() {
    let folder = ScratchFolder::new("unknown-series");
    let database = Database::open(&folder.config()).unwrap();
    let missing = NewSeries::local("Sample Series 09", ADDED_AT_MS)
        .unwrap()
        .id();

    let outcome = add_books(&database, missing, 1).await;

    assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == missing));
}

#[tokio::test]
async fn refuses_a_second_series_for_a_folder_name_that_normalises_alike() {
    let folder = ScratchFolder::new("same-series");
    let database = Database::open(&folder.config()).unwrap();
    add_local_series(&database, "Sample Series 01").await;

    let outcome = database
        .write(|transaction| {
            add_series(
                transaction,
                &NewSeries::local("SAMPLE  series 01", ADDED_AT_MS).unwrap(),
            )
        })
        .await;

    assert!(is_constraint_violation(&outcome));
}

#[tokio::test]
async fn keeps_the_fingerprint_a_book_id_comes_from_and_leaves_its_logical_key_unset() {
    let folder = ScratchFolder::new("book-identity");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;

    add_books(&database, series, 1).await.unwrap();

    let identity: (Option<Vec<u8>>, Option<String>, Option<String>) = database
        .read(move |connection| {
            Ok(connection.query_row(
                "SELECT content_fp, fp_kind, logical_key FROM book WHERE id = ?1",
                [book_id(series, 0).as_bytes()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?)
        })
        .await
        .unwrap();
    assert_eq!(
        identity,
        (
            Some(fingerprint(series, 0).as_bytes().to_vec()),
            Some("pmf1".to_owned()),
            None
        )
    );
}

#[tokio::test]
async fn refuses_a_book_fingerprint_without_its_kind() {
    let folder = ScratchFolder::new("fingerprint-kind");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;
    add_books(&database, series, 1).await.unwrap();

    let outcome = database
        .write(move |transaction| {
            Ok(transaction.execute(
                "UPDATE book SET fp_kind = NULL WHERE id = ?1",
                [book_id(series, 0).as_bytes()],
            )?)
        })
        .await;

    assert!(is_constraint_violation(&outcome));
}

#[tokio::test]
async fn keeps_a_library_folder_path_that_is_not_unicode_byte_for_byte() {
    let folder = ScratchFolder::new("root-bytes");
    let database = Database::open(&folder.config()).unwrap();
    let path = b"/sample/library-\xff".to_vec();

    database
        .write({
            let path = path.clone();
            move |transaction| {
                Ok(transaction.execute(
                    "INSERT INTO library_root (id, kind, locator_kind, location, added_at_ms)
                     VALUES (1, 'linked', 'path', ?1, ?2)",
                    (path, ADDED_AT_MS),
                )?)
            }
        })
        .await
        .unwrap();

    let stored: Vec<u8> = database
        .read(|connection| {
            Ok(connection.query_row(
                "SELECT location FROM library_root WHERE id = 1",
                [],
                |row| row.get(0),
            )?)
        })
        .await
        .unwrap();
    assert_eq!(stored, path);
}

#[tokio::test]
async fn refuses_a_second_link_to_a_folder_picked_again_with_a_new_bookmark() {
    let folder = ScratchFolder::new("root-twice");
    let database = Database::open(&folder.config()).unwrap();
    link_bookmarked_folder(&database, 1, b"first bookmark")
        .await
        .unwrap();

    let outcome = link_bookmarked_folder(&database, 2, b"second bookmark").await;

    assert!(is_constraint_violation(&outcome));
}

#[tokio::test]
async fn refuses_a_bookmarked_folder_without_its_bookmark() {
    let folder = ScratchFolder::new("root-no-bookmark");
    let database = Database::open(&folder.config()).unwrap();

    let outcome = database
        .write(|transaction| {
            Ok(transaction.execute(
                "INSERT INTO library_root (id, kind, locator_kind, location, added_at_ms)
                 VALUES (1, 'linked', 'apple_bookmark', CAST('/sample/library' AS BLOB), ?1)",
                [ADDED_AT_MS],
            )?)
        })
        .await;

    assert!(is_constraint_violation(&outcome));
}

#[tokio::test]
async fn forgets_the_books_of_a_removed_series() {
    let folder = ScratchFolder::new("remove-series");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;
    add_books(&database, series, 1).await.unwrap();

    database
        .write(move |transaction| {
            Ok(transaction.execute("DELETE FROM series WHERE id = ?1", [series.as_bytes()])?)
        })
        .await
        .unwrap();

    assert_eq!(row_count(&database, "book").await, 0);
}

#[tokio::test]
async fn forgets_the_book_files_of_a_removed_library_folder() {
    let folder = ScratchFolder::new("remove-root");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;
    add_books(&database, series, 1).await.unwrap();
    database
        .write(move |transaction| {
            transaction.execute(
                "INSERT INTO library_root (id, kind, locator_kind, location, added_at_ms)
                 VALUES (1, 'linked', 'path', CAST('/sample/library' AS BLOB), ?1)",
                [ADDED_AT_MS],
            )?;
            Ok(transaction.execute(
                "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                 VALUES (?1, 1, 'Sample Series 01/Volume 01.cbz', 4096, ?2)",
                (book_id(series, 0).as_bytes(), ADDED_AT_MS),
            )?)
        })
        .await
        .unwrap();

    database
        .write(|transaction| Ok(transaction.execute("DELETE FROM library_root WHERE id = 1", [])?))
        .await
        .unwrap();

    assert_eq!(
        (
            row_count(&database, "book_file").await,
            row_count(&database, "book").await
        ),
        (0, 1)
    );
}

#[tokio::test]
async fn finds_a_series_by_any_three_characters_of_its_title() {
    let folder = ScratchFolder::new("search-added");
    let database = Database::open(&folder.config()).unwrap();
    add_local_series(&database, "Sample Series 01").await;

    let found = titles_matching(&database, "ies 0").await;

    assert_eq!(found, ["Sample Series 01"]);
}

#[tokio::test]
async fn searches_a_renamed_series_by_its_new_title_only() {
    let folder = ScratchFolder::new("search-renamed");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;

    database
        .write(move |transaction| {
            Ok(transaction.execute(
                "UPDATE series SET title = 'Example Volume 02' WHERE id = ?1",
                [series.as_bytes()],
            )?)
        })
        .await
        .unwrap();

    assert_eq!(
        (
            titles_matching(&database, "Sample").await,
            titles_matching(&database, "Volume").await
        ),
        (Vec::new(), vec!["Example Volume 02".to_owned()])
    );
}

#[tokio::test]
async fn drops_a_removed_series_from_title_search() {
    let folder = ScratchFolder::new("search-removed");
    let database = Database::open(&folder.config()).unwrap();
    let series = add_local_series(&database, "Sample Series 01").await;

    database
        .write(move |transaction| {
            Ok(transaction.execute("DELETE FROM series WHERE id = ?1", [series.as_bytes()])?)
        })
        .await
        .unwrap();

    assert!(titles_matching(&database, "Sample").await.is_empty());
}

async fn add_local_series(database: &Database, folder_name: &str) -> SeriesId {
    let series = NewSeries::local(folder_name, ADDED_AT_MS).unwrap();
    let id = series.id();
    database
        .write(move |transaction| add_series(transaction, &series))
        .await
        .unwrap();
    id
}

async fn add_books(database: &Database, series: SeriesId, count: u8) -> Result<(), Error> {
    database
        .write(move |transaction| {
            for index in 0..count {
                let book = NewBook {
                    fingerprint: fingerprint(series, index),
                    series,
                    title: format!("Volume {index:02}"),
                    added_at_ms: ADDED_AT_MS,
                };
                add_book(transaction, &book)?;
            }
            Ok(())
        })
        .await
}

fn fingerprint(series: SeriesId, index: u8) -> Fingerprint {
    let page = ImageEntry {
        crc32: u32::from(index),
        size: u64::from_le_bytes(series.as_bytes()[..8].try_into().unwrap()),
    };
    Fingerprint::pmf1([page]).unwrap()
}

fn book_id(series: SeriesId, index: u8) -> BookId {
    BookId::local(&fingerprint(series, index))
}

async fn remove_book(database: &Database, book: BookId) {
    database
        .write(move |transaction| {
            Ok(transaction.execute("DELETE FROM book WHERE id = ?1", [book.as_bytes()])?)
        })
        .await
        .unwrap();
}

async fn book_count(database: &Database, series: SeriesId) -> i64 {
    database
        .read(move |connection| {
            Ok(connection.query_row(
                "SELECT book_count FROM series WHERE id = ?1",
                [series.as_bytes()],
                |row| row.get(0),
            )?)
        })
        .await
        .unwrap()
}

async fn titles_matching(database: &Database, text: &str) -> Vec<String> {
    let query = format!("\"{text}\"");
    database
        .read(move |connection| {
            let mut statement = connection
                .prepare("SELECT title FROM series_fts WHERE series_fts MATCH ?1 ORDER BY rowid")?;
            let titles = statement
                .query_map([query], |row| row.get(0))?
                .collect::<Result<_, _>>()?;
            Ok(titles)
        })
        .await
        .unwrap()
}

async fn row_count(database: &Database, table: &'static str) -> i64 {
    database
        .read(move |connection| {
            Ok(
                connection.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })?,
            )
        })
        .await
        .unwrap()
}

async fn link_bookmarked_folder(
    database: &Database,
    id: i64,
    bookmark: &'static [u8],
) -> Result<usize, Error> {
    database
        .write(move |transaction| {
            Ok(transaction.execute(
                "INSERT INTO library_root (id, kind, locator_kind, location, bookmark, added_at_ms)
                 VALUES (?1, 'linked', 'apple_bookmark', CAST('/sample/library' AS BLOB), ?2, ?3)",
                (id, bookmark, ADDED_AT_MS),
            )?)
        })
        .await
}

fn is_constraint_violation<T>(outcome: &Result<T, Error>) -> bool {
    matches!(
        outcome,
        Err(Error::Statement(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error {
                code: ErrorCode::ConstraintViolation,
                ..
            },
            _
        )))
    )
}
