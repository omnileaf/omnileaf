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

use std::path::PathBuf;

use omnileaf_db::{
    catalog::{
        BookDetails, BookFile, NewRoot, NewSeries, RootId, RootKind, RootLocator, ScannedBook,
        add_root, record_scanned_books, remove_root,
    },
    store::Store,
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const SERIES: &str = "Sample Series 01";
const ANOTHER_SERIES: &str = "Sample Series 02";
const PAGES_PER_BOOK: u32 = 10;
const FILE_NAME: &str = "file_name";
const COMIC_INFO: &str = "comic_info";

type Found = Vec<(String, String)>;
type Row = (i64, String, String);

struct SampleBook<'a> {
    number: u32,
    series: &'a str,
    title: &'a str,
    comic_info_title: Option<&'a str>,
    name_language: Option<&'a str>,
}

impl<'a> SampleBook<'a> {
    fn titled(number: u32, title: &'a str) -> Self {
        Self {
            number,
            series: SERIES,
            title,
            comic_info_title: None,
            name_language: None,
        }
    }

    fn in_series(self, series: &'a str) -> Self {
        Self { series, ..self }
    }

    fn with_comic_info_title(self, title: &'a str) -> Self {
        Self {
            comic_info_title: Some(title),
            ..self
        }
    }

    fn named_in(self, language: &'a str) -> Self {
        Self {
            name_language: Some(language),
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
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Comics")),
            added_at_ms: ADDED_AT_MS,
        };
        let root = store
            .database()
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            store,
            root,
            _folder: folder,
        }
    }

    async fn record(&self, sample: SampleBook<'_>) -> BookId {
        let scanned = ScannedBook {
            series: NewSeries::local(sample.series, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(sample.number),
            title: sample.title.to_owned(),
            added_at_ms: ADDED_AT_MS,
            page_count: PAGES_PER_BOOK,
            details: BookDetails {
                title: sample.comic_info_title.map(str::to_owned),
                ..BookDetails::default()
            },
            file: BookFile {
                root: self.root,
                location: format!("{SERIES}/{}.cbz", sample.number).into(),
                size_bytes: 100,
                modified_at_ms: ADDED_AT_MS,
            },
            numbering: None,
            name_language: sample.name_language.map(str::to_owned),
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        book(sample.number)
    }

    async fn finding(&self, text: &str) -> Found {
        let phrase = format!("\"{text}\"");
        self.store
            .database()
            .read(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT book_title_search.kind, book_title_search.title
                    FROM book_title_fts
                    JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
                    WHERE book_title_fts MATCH ?1 ORDER BY book_title_search.id",
                )?;
                let found = statement
                    .query_map([phrase], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<_, _>>()?;
                Ok(found)
            })
            .await
            .unwrap()
    }

    async fn rows(&self) -> Vec<Row> {
        self.store
            .database()
            .read(|connection| {
                let mut statement = connection
                    .prepare("SELECT id, kind, title FROM book_title_search ORDER BY id")?;
                let rows = statement
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                    .collect::<Result<_, _>>()?;
                Ok(rows)
            })
            .await
            .unwrap()
    }

    async fn execute(&self, sql: &'static str) {
        self.store
            .database()
            .write(move |transaction| Ok(transaction.execute(sql, [])?))
            .await
            .unwrap();
    }

    async fn rows_changed_by(&self, sql: &'static str) -> usize {
        self.store
            .database()
            .write(move |transaction| {
                let before = transaction.total_changes();
                transaction.execute(sql, [])?;
                Ok(usize::try_from(transaction.total_changes() - before).unwrap())
            })
            .await
            .unwrap()
    }

    async fn integrity_holds(&self) -> bool {
        self.store
            .database()
            .write(|transaction| {
                Ok(transaction
                    .execute(
                        "INSERT INTO book_title_fts (book_title_fts, rank)
                        VALUES ('integrity-check', 1)",
                        [],
                    )
                    .is_ok())
            })
            .await
            .unwrap()
    }
}

fn fingerprint_of(number: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: number,
        size: 1,
    }])
    .unwrap()
}

fn found(kind: &str, title: &str) -> (String, String) {
    (kind.to_owned(), title.to_owned())
}

#[tokio::test]
async fn finds_a_new_book_by_its_file_name() {
    let library = Library::open("book-titles-new-book").await;

    library.record(SampleBook::titled(1, "Chapter 120")).await;

    assert_eq!(
        library.finding("chapter 120").await,
        [found(FILE_NAME, "Chapter 120")]
    );
}

#[tokio::test]
async fn finds_a_book_by_its_comic_info_title_beside_its_file_name() {
    let library = Library::open("book-titles-comic-info").await;

    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    assert_eq!(
        library.finding("lantern keeper").await,
        [found(COMIC_INFO, "The Lantern Keeper")]
    );
    assert_eq!(
        library.finding("volume 01").await,
        [found(FILE_NAME, "Volume 01")]
    );
}

#[tokio::test]
async fn does_not_index_a_blank_comic_info_title() {
    let library = Library::open("book-titles-blank-comic-info").await;

    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("   "))
        .await;

    let kinds: Vec<String> = library.rows().await.into_iter().map(|row| row.1).collect();
    assert_eq!(kinds, [FILE_NAME]);
}

#[tokio::test]
async fn finds_a_retitled_book_by_its_new_file_name_only() {
    let library = Library::open("book-titles-retitled").await;
    library.record(SampleBook::titled(1, "Volume 01")).await;

    library.record(SampleBook::titled(1, "Chapter 12")).await;

    assert_eq!(library.finding("volume 01").await, Found::new());
    assert_eq!(
        library.finding("chapter 12").await,
        [found(FILE_NAME, "Chapter 12")]
    );
}

#[tokio::test]
async fn keeps_the_index_rows_of_a_book_relabelled_under_the_same_title() {
    let library = Library::open("book-titles-relabelled").await;
    library.record(SampleBook::titled(1, "Volume 01")).await;
    let before = library.rows().await;
    assert_eq!(before.len(), 1);

    library
        .record(SampleBook::titled(1, "Volume 01").named_in("ja"))
        .await;

    assert_eq!(library.rows().await, before);
}

#[tokio::test]
async fn writes_no_index_row_for_a_title_set_to_itself() {
    let library = Library::open("book-titles-same-title").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    let changed = library
        .rows_changed_by("UPDATE book SET title = title")
        .await;

    assert_eq!(changed, 1);
}

#[tokio::test]
async fn writes_no_index_row_for_a_comic_info_title_set_to_itself() {
    let library = Library::open("book-titles-same-comic-info-title").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    let changed = library
        .rows_changed_by("UPDATE book_details SET title = title")
        .await;

    assert_eq!(changed, 1);
}

#[tokio::test]
async fn swaps_only_the_comic_info_text_when_the_comic_info_title_changes() {
    let library = Library::open("book-titles-comic-info-changed").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;
    let file_name_row = library.rows().await[0].clone();

    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Harbor Gate"))
        .await;

    assert_eq!(library.rows().await[0], file_name_row);
    assert_eq!(library.finding("lantern").await, Found::new());
    assert_eq!(
        library.finding("harbor gate").await,
        [found(COMIC_INFO, "The Harbor Gate")]
    );
}

#[tokio::test]
async fn drops_the_comic_info_row_when_the_comic_info_title_goes_blank() {
    let library = Library::open("book-titles-comic-info-cleared").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    library.record(SampleBook::titled(1, "Volume 01")).await;

    assert_eq!(library.finding("lantern").await, Found::new());
    let kinds: Vec<String> = library.rows().await.into_iter().map(|row| row.1).collect();
    assert_eq!(kinds, [FILE_NAME]);
}

#[tokio::test]
async fn drops_the_comic_info_row_when_the_details_are_deleted() {
    let library = Library::open("book-titles-details-deleted").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    library.execute("DELETE FROM book_details").await;

    assert_eq!(library.finding("lantern").await, Found::new());
    assert_eq!(
        library.finding("volume 01").await,
        [found(FILE_NAME, "Volume 01")]
    );
}

#[tokio::test]
async fn forgets_both_titles_of_a_deleted_book() {
    let library = Library::open("book-titles-book-deleted").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;

    assert_eq!(library.rows().await.len(), 2);

    library.execute("DELETE FROM book").await;

    assert_eq!(library.rows().await, Vec::<Row>::new());
    assert_eq!(library.finding("lantern").await, Found::new());
    assert_eq!(library.finding("volume 01").await, Found::new());
}

#[tokio::test]
async fn forgets_both_titles_of_a_book_removed_from_the_library() {
    let library = Library::open("book-titles-book-removed").await;
    let removed = library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;
    library.record(SampleBook::titled(2, "Chapter 12")).await;

    library
        .store
        .write(move |writer| writer.remove_books_from_library(&[removed]))
        .await
        .unwrap();

    assert_eq!(library.finding("lantern").await, Found::new());
    assert_eq!(library.finding("volume 01").await, Found::new());
    assert_eq!(
        library.finding("chapter 12").await,
        [found(FILE_NAME, "Chapter 12")]
    );
}

#[tokio::test]
async fn forgets_the_titles_of_the_books_of_a_deleted_series() {
    let library = Library::open("book-titles-series-deleted").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;
    library
        .record(SampleBook::titled(2, "Chapter 12").in_series(ANOTHER_SERIES))
        .await;

    library
        .execute("DELETE FROM series WHERE title = 'Sample Series 01'")
        .await;

    assert_eq!(library.finding("lantern").await, Found::new());
    assert_eq!(library.finding("volume 01").await, Found::new());
    assert_eq!(
        library.finding("chapter 12").await,
        [found(FILE_NAME, "Chapter 12")]
    );
}

#[tokio::test]
async fn forgets_the_titles_of_the_books_of_a_removed_root() {
    let library = Library::open("book-titles-root-removed").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;
    library.record(SampleBook::titled(2, "Chapter 12")).await;
    let root = library.root;
    assert_eq!(library.rows().await.len(), 3);

    library
        .store
        .database()
        .write(move |transaction| remove_root(transaction, root))
        .await
        .unwrap();

    assert_eq!(library.rows().await, Vec::<Row>::new());
}

#[tokio::test]
async fn keeps_the_index_rows_of_a_book_moved_to_another_series() {
    let library = Library::open("book-titles-book-moved").await;
    library
        .record(SampleBook::titled(1, "Volume 01").with_comic_info_title("The Lantern Keeper"))
        .await;
    let before = library.rows().await;
    assert_eq!(before.len(), 2);

    library
        .record(
            SampleBook::titled(1, "Volume 01")
                .with_comic_info_title("The Lantern Keeper")
                .in_series(ANOTHER_SERIES),
        )
        .await;

    assert_eq!(library.rows().await, before);
}

#[tokio::test]
async fn keeps_the_index_in_step_with_the_books_through_mixed_changes() {
    let library = Library::open("book-titles-integrity").await;
    for number in 1..=20 {
        library
            .record(SampleBook::titled(number, "Volume 01").with_comic_info_title("Harbor Gate"))
            .await;
    }
    library.record(SampleBook::titled(3, "Chapter 120")).await;
    library.record(SampleBook::titled(4, "Chapter 120")).await;
    library
        .execute(
            "DELETE FROM book_details WHERE book_id IN (SELECT book_id FROM book_details LIMIT 5)",
        )
        .await;
    library
        .execute("DELETE FROM book WHERE id IN (SELECT id FROM book LIMIT 4)")
        .await;

    assert!(library.integrity_holds().await);
}
