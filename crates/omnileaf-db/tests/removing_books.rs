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

use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

use omnileaf_db::{
    adult_content::AdultHiding,
    catalog::{
        AgeRating, BookDetails, BookFile, BookFileToRemove, FolderGroup, FolderGroupSummary,
        NewRoot, NewSeries, PageRequest, PageSize, RemovedBook, RootId, RootKind, RootLocator,
        ScannedBook, SeriesFilter, SeriesFolder, SeriesNaming, Sourced, ValueSource, add_root,
        book_bookmarks, books_of_series, files_of_books, folder_groups, record_scanned_books,
        remove_marked_books, removed_among, series_count,
    },
    store::{ReadingState, RemovedFromLibrary, SeriesEdits, Store, reading_state, series_edits},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, set_position};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";
const FIRST_SERIES: &str = "Sample Series 01";
const SECOND_SERIES: &str = "Sample Series 02";
const MORE_THAN_ONE_BATCH: u32 = 70;
const PAGES_PER_BOOK: u32 = 10;
const FAKE_TAG: &str = "fake-tag";
const AUTHOR_FOLDER: &str = "Author B";
const THIRD_SERIES_FOLDER: &str = "Author B/Sample Series 03";
const FOURTH_SERIES_FOLDER: &str = "Author B/Sample Series 04";

#[derive(Debug, PartialEq, Eq)]
struct Counters {
    book_count: i64,
    read_count: i64,
    started_count: i64,
    bookmarked_books: i64,
    pages_left: i64,
    uncounted_books: i64,
    duplicated_books: i64,
    adult_rated_books: i64,
    manga_books: i64,
    year: Option<i64>,
    language: Option<String>,
    tag_books: Vec<(String, i64)>,
}

struct Library {
    store: Store,
    comics: RootId,
    manga: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let comics = add_linked_root(&store, COMICS).await;
        let manga = add_linked_root(&store, MANGA).await;
        Self {
            store,
            comics,
            manga,
            _folder: folder,
        }
    }

    async fn record(&self, root: RootId, series: &str, number: u32) -> BookId {
        self.record_with(root, series, number, BookDetails::default())
            .await
    }

    async fn record_with(
        &self,
        root: RootId,
        series: &str,
        number: u32,
        details: BookDetails,
    ) -> BookId {
        let scanned = ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(number),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            page_count: PAGES_PER_BOOK,
            details,
            file: BookFile {
                root,
                location: location_of(series, number),
                size_bytes: stored_size(number),
                modified_at_ms: stamp_of(number),
            },
            numbering: None,
            name_language: None,
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        book(number)
    }

    async fn files_of(&self, books: Vec<BookId>) -> Vec<BookFileToRemove> {
        let mut files = self
            .store
            .database()
            .read(move |connection| files_of_books(connection, &books))
            .await
            .unwrap();
        files.sort_by(|left, right| {
            (&left.location, left.root_id).cmp(&(&right.location, right.root_id))
        });
        files
    }

    async fn books_of(&self, series: &str) -> Vec<BookId> {
        let series = SeriesId::local(series).unwrap();
        let mut books = self
            .store
            .database()
            .read(move |connection| books_of_series(connection, series))
            .await
            .unwrap();
        books.sort();
        books
    }

    async fn record_in_folder(&self, series_folder: &str, number: u32) -> BookId {
        let location = Path::new(series_folder);
        let series = NewSeries::folder(
            SeriesFolder {
                linked_folder: "Comics",
                location,
            },
            SeriesNaming {
                title: Sourced {
                    value: series_folder.rsplit('/').next().unwrap().to_owned(),
                    source: ValueSource::FolderName,
                },
                year: None,
            },
            0,
        )
        .unwrap();
        let scanned = ScannedBook {
            series,
            named_series: None,
            fingerprint: fingerprint_of(number),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            page_count: PAGES_PER_BOOK,
            details: BookDetails::default(),
            file: BookFile {
                root: self.comics,
                location: location.join(format!("Volume {number:02}.cbz")),
                size_bytes: stored_size(number),
                modified_at_ms: stamp_of(number),
            },
            numbering: None,
            name_language: None,
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        book(number)
    }

    async fn remove(&self, books: &[BookId]) -> RemovedFromLibrary {
        let books = books.to_vec();
        self.store
            .write(move |writer| writer.remove_books_from_library(&books))
            .await
            .unwrap()
    }

    async fn mark_removed(&self, book: BookId) {
        self.store
            .write(move |writer| writer.set_removed(book, true))
            .await
            .unwrap();
    }

    async fn marked_among(&self, books: Vec<BookId>) -> BTreeSet<BookId> {
        self.store
            .database()
            .read(move |connection| removed_among(connection, &books))
            .await
            .unwrap()
    }

    async fn removal_registers(&self) -> i64 {
        self.count("SELECT count(*) FROM sync_register WHERE field = 'removed'")
            .await
    }

    async fn count(&self, sql: &'static str) -> i64 {
        self.store
            .database()
            .read(move |connection| Ok(connection.query_row(sql, [], |row| row.get(0))?))
            .await
            .unwrap()
    }

    async fn rows_of(&self, table: &str) -> i64 {
        let sql = format!("SELECT count(*) FROM {table}");
        self.store
            .database()
            .read(move |connection| Ok(connection.query_row(&sql, [], |row| row.get(0))?))
            .await
            .unwrap()
    }

    async fn catalog_books(&self) -> BTreeSet<BookId> {
        self.store
            .database()
            .read(|connection| {
                let mut statement = connection.prepare("SELECT id FROM book")?;
                let books = statement
                    .query_map([], |row| row.get::<_, Vec<u8>>(0))?
                    .map(|id| Ok(BookId::try_from(id?.as_slice()).unwrap()))
                    .collect::<Result<_, omnileaf_db::Error>>()?;
                Ok(books)
            })
            .await
            .unwrap()
    }

    async fn counters(&self, series: &str) -> Counters {
        let series = SeriesId::local(series).unwrap();
        self.store
            .database()
            .read(move |connection| {
                let id = series.as_bytes();
                let mut tags = connection.prepare(
                    "SELECT series_tag.name, series_tag.book_count FROM series_tag
                    JOIN series ON series.local_id = series_tag.series_local_id
                    WHERE series.id = ?1 ORDER BY series_tag.name",
                )?;
                let tag_books = tags
                    .query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<_, _>>()?;
                Ok(connection.query_row(
                    "SELECT book_count, read_count, started_count, bookmarked_books, pages_left,
                        uncounted_books, duplicated_books, adult_rated_books, manga_books,
                        year, language
                    FROM series WHERE id = ?1",
                    [id],
                    |row| {
                        Ok(Counters {
                            book_count: row.get(0)?,
                            read_count: row.get(1)?,
                            started_count: row.get(2)?,
                            bookmarked_books: row.get(3)?,
                            pages_left: row.get(4)?,
                            uncounted_books: row.get(5)?,
                            duplicated_books: row.get(6)?,
                            adult_rated_books: row.get(7)?,
                            manga_books: row.get(8)?,
                            year: row.get(9)?,
                            language: row.get(10)?,
                            tag_books,
                        })
                    },
                )?)
            })
            .await
            .unwrap()
    }

    async fn shown_series(&self) -> u32 {
        self.store
            .database()
            .read(|connection| series_count(connection, &SeriesFilter::NONE))
            .await
            .unwrap()
    }

    async fn folder_groups(&self) -> Vec<FolderGroupSummary> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| folder_groups(connection, &request, AdultHiding::default()))
            .await
            .unwrap()
            .items
    }

    async fn reading_of(&self, book: BookId) -> (Option<ReadingState>, Vec<u32>) {
        self.store
            .database()
            .read(move |connection| {
                Ok((
                    reading_state(connection, book)?,
                    book_bookmarks(connection, book)?,
                ))
            })
            .await
            .unwrap()
    }
}

async fn add_linked_root(store: &Store, path: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: ADDED_AT_MS,
    };
    store
        .database()
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

fn fingerprint_of(number: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: number,
        size: 1,
    }])
    .unwrap()
}

fn location_of(series: &str, number: u32) -> PathBuf {
    PathBuf::from(format!("{series}/Volume {number:02}.cbz"))
}

fn stored_size(number: u32) -> u64 {
    u64::from(number) * 100
}

fn stamp_of(number: u32) -> i64 {
    ADDED_AT_MS + i64::from(number)
}

fn file_to_remove(number: u32, series: &str, (root_id, root): (RootId, &str)) -> BookFileToRemove {
    BookFileToRemove {
        book: book(number),
        root_id,
        root: RootLocator::Path(PathBuf::from(root)),
        location: location_of(series, number),
        size_bytes: stored_size(number),
        modified_at_ms: stamp_of(number),
    }
}

#[tokio::test]
async fn files_of_books_lists_every_file_with_its_root_size_and_stamp() {
    let library = Library::open("files-of-books").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;
    library.record(library.manga, FIRST_SERIES, 2).await;
    library.record(library.comics, SECOND_SERIES, 3).await;

    let files = library.files_of(vec![book(1), book(2)]).await;

    let comics = (library.comics, COMICS);
    let manga = (library.manga, MANGA);
    assert_eq!(
        files,
        [
            file_to_remove(1, FIRST_SERIES, comics),
            file_to_remove(2, FIRST_SERIES, comics),
            file_to_remove(2, FIRST_SERIES, manga),
        ]
    );
}

#[tokio::test]
async fn files_of_books_finds_the_files_beyond_one_batch_and_none_for_unknown_books() {
    let library = Library::open("files-of-books-many").await;
    for number in 1..=MORE_THAN_ONE_BATCH {
        library.record(library.comics, FIRST_SERIES, number).await;
    }
    let mut asked: Vec<BookId> = (1..=MORE_THAN_ONE_BATCH).map(book).collect();
    asked.push(book(MORE_THAN_ONE_BATCH + 1));

    let files = library.files_of(asked).await;

    assert_eq!(files.len(), usize::try_from(MORE_THAN_ONE_BATCH).unwrap());
}

#[tokio::test]
async fn books_of_series_lists_every_book_of_the_series_and_nothing_else() {
    let library = Library::open("books-of-series").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;
    library.record(library.comics, SECOND_SERIES, 3).await;

    let books = library.books_of(FIRST_SERIES).await;

    let mut expected = vec![book(1), book(2)];
    expected.sort();
    assert_eq!(books, expected);
}

fn marked_book_details() -> BookDetails {
    BookDetails {
        tags: vec![FAKE_TAG.to_owned()],
        age_rating: Some(AgeRating::AdultsOnly18),
        is_manga: Some(true),
        year: Some(2001),
        language: Some("en".to_owned()),
        ..BookDetails::default()
    }
}

fn counters_with_four_books() -> Counters {
    Counters {
        book_count: 4,
        read_count: 1,
        started_count: 2,
        bookmarked_books: 1,
        pages_left: 27,
        uncounted_books: 0,
        duplicated_books: 1,
        adult_rated_books: 1,
        manga_books: 1,
        year: Some(2001),
        language: Some("en".to_owned()),
        tag_books: vec![(FAKE_TAG.to_owned(), 1)],
    }
}

async fn library_with_four_books_in_every_counter(name: &str) -> Library {
    let library = Library::open(name).await;
    let comics = library.comics;
    library.record(comics, FIRST_SERIES, 1).await;
    library.record(comics, FIRST_SERIES, 2).await;
    library
        .record_with(comics, FIRST_SERIES, 3, marked_book_details())
        .await;
    library.record(comics, FIRST_SERIES, 4).await;
    library.record(library.manga, FIRST_SERIES, 4).await;
    library
        .store
        .write(|writer| {
            writer.set_read(book(1), true)?;
            writer.set_position(book(2), 3)?;
            writer.set_bookmark(book(2), 3, true)
        })
        .await
        .unwrap();
    library
}

#[tokio::test]
async fn removing_a_book_deletes_its_row_files_and_details() {
    let library = Library::open("remove-row-files-details").await;
    library
        .record_with(
            library.comics,
            FIRST_SERIES,
            1,
            BookDetails {
                tags: vec![FAKE_TAG.to_owned()],
                ..BookDetails::default()
            },
        )
        .await;
    library.record(library.comics, FIRST_SERIES, 2).await;

    library.remove(&[book(1)]).await;

    let rows = [
        library.rows_of("book_file").await,
        library.rows_of("book_details").await,
        library.rows_of("book_tag").await,
    ];
    assert_eq!(
        (library.catalog_books().await, rows),
        (BTreeSet::from([book(2)]), [1, 1, 0])
    );
}

#[tokio::test]
async fn removing_a_book_updates_the_series_book_count_and_read_counts() {
    let library = library_with_four_books_in_every_counter("remove-counters").await;
    let before = library.counters(FIRST_SERIES).await;

    let mut after = Vec::new();
    for removed in [book(2), book(3), book(4)] {
        library.remove(&[removed]).await;
        after.push(library.counters(FIRST_SERIES).await);
    }

    assert_eq!(before, counters_with_four_books());
    assert_eq!(
        after,
        [
            Counters {
                book_count: 3,
                started_count: 1,
                bookmarked_books: 0,
                pages_left: 20,
                ..counters_with_four_books()
            },
            Counters {
                book_count: 2,
                started_count: 1,
                bookmarked_books: 0,
                pages_left: 10,
                adult_rated_books: 0,
                manga_books: 0,
                year: None,
                language: None,
                tag_books: Vec::new(),
                ..counters_with_four_books()
            },
            Counters {
                book_count: 1,
                started_count: 1,
                bookmarked_books: 0,
                pages_left: 0,
                duplicated_books: 0,
                adult_rated_books: 0,
                manga_books: 0,
                year: None,
                language: None,
                tag_books: Vec::new(),
                ..counters_with_four_books()
            },
        ]
    );
}

#[tokio::test]
async fn a_series_left_with_no_books_leaves_the_listing_and_its_folder_groups() {
    let library = Library::open("remove-series-listing").await;
    library.record_in_folder(THIRD_SERIES_FOLDER, 1).await;
    library.record_in_folder(THIRD_SERIES_FOLDER, 2).await;
    library.record_in_folder(FOURTH_SERIES_FOLDER, 3).await;
    let group = |series_count| FolderGroupSummary {
        group: FolderGroup {
            root: library.comics,
            location: PathBuf::from(AUTHOR_FOLDER),
        },
        series_count,
    };
    let before = (library.shown_series().await, library.folder_groups().await);

    library.remove(&[book(1), book(2)]).await;
    let one_series_left = (library.shown_series().await, library.folder_groups().await);
    library.remove(&[book(3)]).await;
    let none_left = (library.shown_series().await, library.folder_groups().await);

    assert_eq!(before, (2, vec![group(2)]));
    assert_eq!(one_series_left, (1, vec![group(1)]));
    assert_eq!(none_left, (0, Vec::new()));
}

#[tokio::test]
async fn removing_a_book_held_in_two_folders_lists_both_files_and_removes_it() {
    let library = Library::open("remove-two-folders").await;
    library.record(library.comics, FIRST_SERIES, 2).await;
    library.record(library.manga, FIRST_SERIES, 2).await;

    let removed = library.remove(&[book(2)]).await;

    let mut files = removed.files;
    files.sort_by_key(|file| file.root_id);
    assert_eq!(
        (removed.books, files, library.rows_of("book_file").await),
        (
            1,
            vec![
                file_to_remove(2, FIRST_SERIES, (library.comics, COMICS)),
                file_to_remove(2, FIRST_SERIES, (library.manga, MANGA)),
            ],
            0
        )
    );
    assert!(library.catalog_books().await.is_empty());
}

#[tokio::test]
async fn removing_a_book_keeps_its_reading_position_bookmarks_and_series_edits() {
    let library = library_with_four_books_in_every_counter("remove-keeps-reading").await;
    let series = SeriesId::local(FIRST_SERIES).unwrap();
    let edits = SeriesEdits {
        is_adult: true,
        ..SeriesEdits::default()
    };
    library
        .store
        .write(move |writer| writer.edit_series(series, edits))
        .await
        .unwrap();
    set_position(&library.store, book(2), 4).await.unwrap();
    let reading_before = library.reading_of(book(2)).await;

    library.remove(&[book(2)]).await;

    let kept_edits = library
        .store
        .database()
        .read(move |connection| series_edits(connection, series))
        .await
        .unwrap();
    assert_eq!(library.reading_of(book(2)).await, reading_before);
    assert_eq!(
        reading_before,
        (
            Some(ReadingState {
                position_page: Some(4),
                furthest_page: None,
                is_read: None
            }),
            vec![3]
        )
    );
    assert!(kept_edits.is_adult);
}

#[tokio::test]
async fn recording_a_removed_book_again_restores_progress_and_the_series_counters() {
    let library = library_with_four_books_in_every_counter("remove-record-again").await;
    let before = library.counters(FIRST_SERIES).await;
    library.remove(&[book(1), book(2)]).await;

    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;

    assert_eq!(library.counters(FIRST_SERIES).await, before);
}

#[tokio::test]
async fn removing_a_book_twice_reports_nothing_the_second_time() {
    let library = Library::open("remove-twice").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.remove(&[book(1)]).await;

    let second = library.remove(&[book(1)]).await;

    assert_eq!(
        second,
        RemovedFromLibrary {
            books: 0,
            files: Vec::new()
        }
    );
}

#[tokio::test]
async fn removing_the_same_book_listed_twice_counts_it_and_its_files_once() {
    let library = Library::open("remove-listed-twice").await;
    library.record(library.comics, FIRST_SERIES, 1).await;

    let removed = library.remove(&[book(1), book(1)]).await;

    assert_eq!((removed.books, removed.files.len()), (1, 1));
}

#[tokio::test]
async fn an_unknown_book_is_neither_marked_nor_counted() {
    let library = Library::open("remove-unknown").await;
    library.record(library.comics, FIRST_SERIES, 1).await;

    let removed = library.remove(&[book(9)]).await;

    assert_eq!(
        (
            removed,
            library.marked_among(vec![book(9)]).await,
            library.removal_registers().await
        ),
        (
            RemovedFromLibrary {
                books: 0,
                files: Vec::new()
            },
            BTreeSet::new(),
            0
        )
    );
}

#[tokio::test]
async fn removing_a_book_marks_it_once_in_the_household_register() {
    let library = Library::open("remove-marks").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;

    library.remove(&[book(1)]).await;

    assert_eq!(
        (
            library.marked_among(vec![book(1), book(2)]).await,
            library.removal_registers().await
        ),
        (BTreeSet::from([book(1)]), 1)
    );
}

#[tokio::test]
async fn a_book_marked_by_another_device_is_still_removed_and_reports_its_files() {
    let library = Library::open("remove-marked-elsewhere").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.mark_removed(book(1)).await;

    let removed = library.remove(&[book(1)]).await;

    assert_eq!(
        (
            removed,
            library.catalog_books().await,
            library.removal_registers().await
        ),
        (
            RemovedFromLibrary {
                books: 1,
                files: vec![file_to_remove(1, FIRST_SERIES, (library.comics, COMICS))]
            },
            BTreeSet::new(),
            1
        )
    );
}

#[tokio::test]
async fn remove_marked_books_deletes_the_catalog_rows_of_marked_books_without_touching_unmarked_ones()
 {
    let library = Library::open("remove-marked-books").await;
    for number in 1..=3 {
        library.record(library.comics, FIRST_SERIES, number).await;
    }
    library.mark_removed(book(1)).await;
    library.mark_removed(book(2)).await;
    library.mark_removed(book(9)).await;

    let removed = library
        .store
        .database()
        .write(|transaction| remove_marked_books(transaction))
        .await
        .unwrap();

    let comics = (library.comics, COMICS);
    let removed: BTreeMap<BookId, Vec<BookFileToRemove>> = removed
        .into_iter()
        .map(|RemovedBook { book, files }| (book, files))
        .collect();
    assert_eq!(
        removed,
        BTreeMap::from([
            (book(1), vec![file_to_remove(1, FIRST_SERIES, comics)]),
            (book(2), vec![file_to_remove(2, FIRST_SERIES, comics)]),
        ])
    );
    assert_eq!(library.catalog_books().await, BTreeSet::from([book(3)]));
}
