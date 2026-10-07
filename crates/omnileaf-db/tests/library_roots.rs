#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use omnileaf_db::{
    Database, Error,
    catalog::{
        LibraryRoot, NewBook, NewRoot, NewSeries, Page, PageRequest, PageSize, RootId, RootKind,
        RootLocator, add_book, add_root, add_series, library_root, library_roots,
        mark_root_available, mark_root_unavailable, remove_root, series_books, set_home_root,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const FIRST_MISSED_AT_MS: i64 = 1_790_000_100_000;
const MISSED_AGAIN_AT_MS: i64 = 1_790_000_200_000;
const SERIES: &str = "Sample Series 01";
const HOME: &str = "/data/Omnileaf";
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";
const SAMPLES: &str = "/media/Samples";
const MOVED_HOME: &str = "/data/Moved/Omnileaf";

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        Self {
            database: Database::open(&folder.config()).unwrap(),
            _folder: folder,
        }
    }

    async fn add(&self, kind: RootKind, path: impl AsRef<Path>) -> RootId {
        let root = NewRoot {
            kind,
            locator: RootLocator::Path(path.as_ref().to_path_buf()),
            added_at_ms: ADDED_AT_MS,
        };
        self.database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap()
    }

    async fn set_home(&self, path: impl AsRef<Path>) -> RootId {
        let locator = RootLocator::Path(path.as_ref().to_path_buf());
        self.database
            .write(move |transaction| set_home_root(transaction, &locator, ADDED_AT_MS))
            .await
            .unwrap()
    }

    async fn remove(&self, id: RootId) -> Result<(), Error> {
        self.database
            .write(move |transaction| remove_root(transaction, id))
            .await
    }

    async fn mark_unavailable(&self, id: RootId, since_ms: i64) -> Result<(), Error> {
        self.database
            .write(move |transaction| mark_root_unavailable(transaction, id, since_ms))
            .await
    }

    async fn mark_available(&self, id: RootId) -> Result<(), Error> {
        self.database
            .write(move |transaction| mark_root_available(transaction, id))
            .await
    }

    async fn unavailable_since(&self, id: RootId) -> Option<i64> {
        self.database
            .read(move |connection| library_root(connection, id))
            .await
            .unwrap()
            .unavailable_since_ms
    }

    async fn add_series(&self) -> SeriesId {
        let series = NewSeries::local(SERIES, ADDED_AT_MS).unwrap();
        let id = series.id();
        self.database
            .write(move |transaction| add_series(transaction, &series))
            .await
            .unwrap();
        id
    }

    /// Adds a book with a copy of its file in each of `roots`.
    async fn add_book(&self, series: SeriesId, index: u8, roots: &[RootId]) -> BookId {
        let book = NewBook {
            fingerprint: Fingerprint::pmf1([ImageEntry {
                crc32: u32::from(index),
                size: 1,
            }])
            .unwrap(),
            series,
            title: format!("Volume {index:02}"),
            added_at_ms: ADDED_AT_MS,
        };
        let id = book.id();
        let roots: Vec<i64> = roots.iter().map(|root| row_key(*root)).collect();
        self.database
            .write(move |transaction| {
                add_book(transaction, &book)?;
                for root in roots {
                    transaction.execute(
                        "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                         VALUES (?1, ?2, ?3, 1, ?4)",
                        (id.as_bytes(), root, book.title.as_bytes(), ADDED_AT_MS),
                    )?;
                }
                Ok(())
            })
            .await
            .unwrap();
        id
    }

    async fn book_ids(&self) -> BTreeSet<BookId> {
        self.database
            .read(|connection| {
                let mut statement = connection.prepare("SELECT id FROM book")?;
                let ids = statement
                    .query_map([], |row| row.get::<_, Vec<u8>>(0))?
                    .map(|id| Ok(BookId::try_from(id?.as_slice()).unwrap()))
                    .collect::<Result<_, Error>>()?;
                Ok(ids)
            })
            .await
            .unwrap()
    }

    async fn page(&self, request: PageRequest) -> Page<LibraryRoot> {
        self.database
            .read(move |connection| library_roots(connection, &request))
            .await
            .unwrap()
    }

    async fn locations(&self) -> Vec<(RootKind, PathBuf)> {
        let request = first_page(PageSize::MAX);
        self.page(request)
            .await
            .items
            .into_iter()
            .map(|root| match root.locator {
                RootLocator::Path(path) => (root.kind, path),
            })
            .collect()
    }
}

/// The root's row key, for seeding the tables that refer to it.
fn row_key(id: RootId) -> i64 {
    id.to_string().parse().unwrap()
}

fn first_page(size: u16) -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(size).unwrap(),
    }
}

#[tokio::test]
async fn lists_the_roots_in_the_order_they_were_added() {
    let library = Library::open("roots-in-order");
    library.add(RootKind::Home, HOME).await;
    library.add(RootKind::Linked, MANGA).await;

    library.add(RootKind::Linked, COMICS).await;

    assert_eq!(
        library.locations().await,
        [
            (RootKind::Home, PathBuf::from(HOME)),
            (RootKind::Linked, PathBuf::from(MANGA)),
            (RootKind::Linked, PathBuf::from(COMICS)),
        ]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn lists_a_folder_whose_name_is_not_unicode_as_it_was_added() {
    use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
    let library = Library::open("root-not-unicode");
    let path = PathBuf::from(OsStr::from_bytes(b"/media/Sample \xff Library"));

    library.add(RootKind::Linked, &path).await;

    assert_eq!(library.locations().await, [(RootKind::Linked, path)]);
}

#[tokio::test]
async fn reads_one_root_by_its_id() {
    let library = Library::open("root-by-id");
    library.add(RootKind::Linked, MANGA).await;
    let comics = library.add(RootKind::Linked, COMICS).await;

    let root = library
        .database
        .read(move |connection| library_root(connection, comics))
        .await;

    assert!(matches!(
        root,
        Ok(LibraryRoot { id, kind: RootKind::Linked, locator: RootLocator::Path(path), .. })
            if id == comics && path == Path::new(COMICS)
    ));
}

#[tokio::test]
async fn reports_a_root_id_missing_from_the_library() {
    let library = Library::open("root-by-missing-id");
    let removed = library.add(RootKind::Linked, COMICS).await;
    library.remove(removed).await.unwrap();

    let root = library
        .database
        .read(move |connection| library_root(connection, removed))
        .await;

    assert!(matches!(root, Err(Error::UnknownRoot { id }) if id == removed));
}

#[tokio::test]
async fn keeps_one_root_for_a_folder_added_twice() {
    let library = Library::open("root-added-twice");
    let first = library.add(RootKind::Linked, COMICS).await;

    let second = library.add(RootKind::Linked, COMICS).await;

    assert_eq!(second, first);
    assert_eq!(
        library.locations().await,
        [(RootKind::Linked, PathBuf::from(COMICS))]
    );
}

#[tokio::test]
async fn continues_the_list_after_the_cursor_of_the_last_page() {
    let library = Library::open("root-pages");
    library.add(RootKind::Home, HOME).await;
    library.add(RootKind::Linked, MANGA).await;
    let last = library.add(RootKind::Linked, COMICS).await;
    let first = library.page(first_page(2)).await;

    let second = library
        .page(PageRequest {
            after: first.next.clone(),
            size: PageSize::try_from(2).unwrap(),
        })
        .await;

    assert_eq!(first.items.len(), 2);
    assert_eq!(
        second.items.iter().map(|root| root.id).collect::<Vec<_>>(),
        [last]
    );
    assert_eq!(second.next, None);
}

#[tokio::test]
async fn refuses_a_cursor_another_list_gave_out() {
    let library = Library::open("root-pages-other-cursor");
    let series = library.add_series().await;
    library.add_book(series, 1, &[]).await;
    library.add_book(series, 2, &[]).await;
    let books = library
        .database
        .read(move |connection| series_books(connection, series, &first_page(1)))
        .await
        .unwrap();
    let request = PageRequest {
        after: books.next,
        size: PageSize::try_from(1).unwrap(),
    };

    let outcome = library
        .database
        .read(move |connection| library_roots(connection, &request))
        .await;

    assert!(matches!(outcome, Err(Error::CursorForAnotherList)));
}

#[tokio::test]
async fn forgets_a_removed_folder() {
    let library = Library::open("remove-root");
    library.add(RootKind::Home, HOME).await;
    let comics = library.add(RootKind::Linked, COMICS).await;

    library.remove(comics).await.unwrap();

    assert_eq!(
        library.locations().await,
        [(RootKind::Home, PathBuf::from(HOME))]
    );
}

#[tokio::test]
async fn removes_the_books_found_only_in_the_removed_folder() {
    let library = Library::open("remove-root-books");
    let comics = library.add(RootKind::Linked, COMICS).await;
    let manga = library.add(RootKind::Linked, MANGA).await;
    let series = library.add_series().await;
    library.add_book(series, 0, &[comics]).await;
    let in_both = library.add_book(series, 1, &[comics, manga]).await;
    let only_in_manga = library.add_book(series, 2, &[manga]).await;

    library.remove(comics).await.unwrap();

    assert_eq!(
        library.book_ids().await,
        BTreeSet::from([in_both, only_in_manga])
    );
}

#[tokio::test]
async fn keeps_the_home_folder() {
    let library = Library::open("remove-home");
    let home = library.add(RootKind::Home, HOME).await;

    let outcome = library.remove(home).await;

    assert!(matches!(outcome, Err(Error::HomeRoot { id }) if id == home));
    assert_eq!(
        library.locations().await,
        [(RootKind::Home, PathBuf::from(HOME))]
    );
}

#[tokio::test]
async fn reports_a_folder_missing_from_the_library() {
    let library = Library::open("remove-missing");
    let comics = library.add(RootKind::Linked, COMICS).await;
    library.remove(comics).await.unwrap();

    let outcome = library.remove(comics).await;

    assert!(matches!(outcome, Err(Error::UnknownRoot { id }) if id == comics));
}

#[tokio::test]
async fn gives_a_removed_folder_id_to_no_folder_added_later() {
    let library = Library::open("remove-root-id");
    library.add(RootKind::Linked, COMICS).await;
    let manga = library.add(RootKind::Linked, MANGA).await;
    library.remove(manga).await.unwrap();

    let added_later = library.add(RootKind::Linked, SAMPLES).await;

    assert_ne!(added_later, manga);
}

#[tokio::test]
async fn names_the_locator_of_a_stored_folder_it_cannot_open() {
    let library = Library::open("root-unsupported-locator");
    library
        .database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
                 VALUES ('linked', 'android_tree', x'01', 0)",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let request = first_page(1);

    let outcome = library
        .database
        .read(move |connection| library_roots(connection, &request))
        .await;

    assert!(matches!(
        outcome,
        Err(Error::Statement(rusqlite::Error::FromSqlConversionFailure(_, _, source)))
            if matches!(
                source.downcast_ref::<Error>(),
                Some(Error::UnsupportedLocator { kind }) if kind == "android_tree"
            )
    ));
}

#[tokio::test]
async fn refuses_a_second_home_folder() {
    let library = Library::open("second-home");
    library.add(RootKind::Home, HOME).await;
    let second = NewRoot {
        kind: RootKind::Home,
        locator: RootLocator::Path(PathBuf::from(SAMPLES)),
        added_at_ms: ADDED_AT_MS,
    };

    let outcome = library
        .database
        .write(move |transaction| add_root(transaction, &second))
        .await;

    assert!(matches!(
        outcome,
        Err(Error::Statement(rusqlite::Error::SqliteFailure(failure, _)))
            if failure.code == rusqlite::ErrorCode::ConstraintViolation
    ));
    assert_eq!(
        library.locations().await,
        [(RootKind::Home, PathBuf::from(HOME))]
    );
}

#[tokio::test]
async fn sets_the_home_folder_once_for_a_location_set_again() {
    let library = Library::open("home-set-again");
    let first = library.set_home(HOME).await;

    let again = library.set_home(HOME).await;

    assert_eq!(again, first);
    assert_eq!(
        library.locations().await,
        [(RootKind::Home, PathBuf::from(HOME))]
    );
}

#[tokio::test]
async fn moves_the_home_folder_without_leaving_the_old_one_behind() {
    let library = Library::open("home-moved");
    let home = library.set_home(HOME).await;
    library.add(RootKind::Linked, COMICS).await;

    let moved = library.set_home(MOVED_HOME).await;

    assert_eq!(moved, home);
    assert_eq!(
        library.locations().await,
        [
            (RootKind::Home, PathBuf::from(MOVED_HOME)),
            (RootKind::Linked, PathBuf::from(COMICS)),
        ]
    );
}

#[tokio::test]
async fn makes_a_linked_folder_the_home_folder_when_home_moves_into_it() {
    let library = Library::open("home-moved-into-linked");
    library.set_home(HOME).await;
    let comics = library.add(RootKind::Linked, COMICS).await;

    let moved = library.set_home(COMICS).await;

    assert_eq!(moved, comics);
    assert_eq!(
        library.locations().await,
        [(RootKind::Home, PathBuf::from(COMICS))]
    );
}

#[tokio::test]
async fn reads_a_new_root_as_available() {
    let library = Library::open("root-available");

    let comics = library.add(RootKind::Linked, COMICS).await;

    assert_eq!(library.unavailable_since(comics).await, None);
}

#[tokio::test]
async fn keeps_the_time_a_root_was_first_found_unavailable() {
    let library = Library::open("root-unavailable");
    let comics = library.add(RootKind::Linked, COMICS).await;
    library
        .mark_unavailable(comics, FIRST_MISSED_AT_MS)
        .await
        .unwrap();

    library
        .mark_unavailable(comics, MISSED_AGAIN_AT_MS)
        .await
        .unwrap();

    assert_eq!(
        library.unavailable_since(comics).await,
        Some(FIRST_MISSED_AT_MS)
    );
}

#[tokio::test]
async fn reads_a_root_found_again_as_available() {
    let library = Library::open("root-available-again");
    let comics = library.add(RootKind::Linked, COMICS).await;
    library
        .mark_unavailable(comics, FIRST_MISSED_AT_MS)
        .await
        .unwrap();

    library.mark_available(comics).await.unwrap();

    assert_eq!(library.unavailable_since(comics).await, None);
}

#[tokio::test]
async fn refuses_to_mark_a_root_missing_from_the_library() {
    let library = Library::open("root-mark-missing");
    let comics = library.add(RootKind::Linked, COMICS).await;
    library.remove(comics).await.unwrap();

    let outcomes = [
        library.mark_unavailable(comics, FIRST_MISSED_AT_MS).await,
        library.mark_available(comics).await,
    ];

    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, Err(Error::UnknownRoot { id }) if *id == comics))
    );
}
