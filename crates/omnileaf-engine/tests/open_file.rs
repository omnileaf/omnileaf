#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write plain archives, so the other kinds of book go unused"
)]
mod books;
mod support;

use std::{fs, path::PathBuf};

use books::write_book;
use omnileaf_engine::{
    BookReading, FileToRead, Library, LibraryListing, OpenFileError, ResourceRouter,
};
use support::{FixedClock, ScratchFolder};

const SEED: u64 = 11;

struct Opening {
    library: Library,
    router: ResourceRouter,
    outside: ScratchFolder,
    _home: ScratchFolder,
    _cache: ScratchFolder,
}

impl Opening {
    async fn new(name: &str) -> Self {
        let home = ScratchFolder::new(&format!("{name}-home"));
        let cache = ScratchFolder::new(&format!("{name}-cache"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        Self {
            library,
            router: ResourceRouter::open(cache.path()).unwrap(),
            outside: ScratchFolder::new(&format!("{name}-outside")),
            _home: home,
            _cache: cache,
        }
    }

    fn file(&self, folder: &str, name: &str, seed: u64) -> PathBuf {
        let path = self.outside.path().join(folder).join(name);
        write_book(&path, seed);
        path
    }

    async fn listed_series(&self) -> usize {
        self.library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .len()
    }
}

#[tokio::test]
async fn opens_a_file_outside_the_library_without_adding_it() {
    let opening = Opening::new("open-outside").await;
    let path = opening.file("Loose Comics", "Odd Tale.cbz", SEED);

    let to_read = opening.library.open_file(path).await.unwrap();
    let opened = opening
        .router
        .open_book(&opening.library, to_read.book, Vec::new())
        .await
        .unwrap();

    assert_eq!(
        (
            to_read.is_in_library,
            opened.is_in_library,
            opened.title.as_str(),
            opened.series_title.as_str(),
            opened.pages.len(),
            (opened.previous.is_none(), opened.next.is_none()),
            opening.listed_series().await,
        ),
        (false, false, "Odd Tale", "Loose Comics", 2, (true, true), 0)
    );
}

#[tokio::test]
async fn serves_the_pages_of_a_file_outside_the_library() {
    let opening = Opening::new("serve-outside").await;
    let path = opening.file("Loose Comics", "Odd Tale.cbz", SEED);
    let to_read = opening.library.open_file(path).await.unwrap();
    let opened = opening
        .router
        .open_book(&opening.library, to_read.book, Vec::new())
        .await
        .unwrap();

    let page = opening
        .router
        .respond(
            &opening.library,
            &format!("/{}", opened.pages.first().unwrap().path),
        )
        .await;

    assert!(matches!(page, omnileaf_engine::Resource::Immutable { .. }));
}

#[tokio::test]
async fn gives_a_file_the_library_already_holds_that_books_own_id() {
    let opening = Opening::new("open-inside").await;
    let folder = opening.outside.path().join("Held Comics");
    write_book(&folder.join("Held Tale.cbz"), SEED);
    opening
        .library
        .add_folder(folder.clone(), |_| {})
        .await
        .unwrap();

    let to_read = opening
        .library
        .open_file(folder.join("Held Tale.cbz"))
        .await
        .unwrap();
    let opened = opening
        .router
        .open_book(&opening.library, to_read.book, Vec::new())
        .await
        .unwrap();

    assert_eq!(
        (to_read.is_in_library, opened.is_in_library, opened.position),
        (true, true, 1)
    );
}

#[tokio::test]
async fn keeps_a_file_outside_the_library_read_once_its_last_page_was_shown() {
    let opening = Opening::new("place-outside").await;
    let path = opening.file("Loose Comics", "Odd Tale.cbz", SEED);
    let to_read = opening.library.open_file(path.clone()).await.unwrap();
    opening
        .router
        .open_book(&opening.library, to_read.book, Vec::new())
        .await
        .unwrap();
    opening
        .library
        .reading_restored(to_read.book, 0, omnileaf_engine::UtcOffset::UTC)
        .await
        .unwrap();
    opening
        .library
        .page_shown(to_read.book, 1, omnileaf_engine::UtcOffset::UTC)
        .await
        .unwrap();
    opening.library.put_away().await.unwrap();
    let again = opening.library.open_file(path).await.unwrap();

    let opened = opening
        .router
        .open_book(&opening.library, again.book, Vec::new())
        .await
        .unwrap();

    assert_eq!(
        (again, opened.reading),
        (
            FileToRead {
                book: to_read.book,
                is_in_library: false
            },
            BookReading::Read
        )
    );
}

#[tokio::test]
async fn refuses_a_file_that_is_not_a_readable_book() {
    let opening = Opening::new("open-unreadable").await;
    let path = opening.outside.path().join("Not A Book.cbz");
    fs::create_dir_all(opening.outside.path()).unwrap();
    fs::write(&path, b"not an archive").unwrap();

    let refused = opening.library.open_file(path).await;

    assert!(matches!(refused, Err(OpenFileError::Unreadable { .. })));
}

#[tokio::test]
async fn names_the_place_of_a_file_outside_the_library_as_not_in_it() {
    let opening = Opening::new("place-outside").await;
    let path = opening.file("Loose Comics", "Odd Tale.cbz", SEED);
    let to_read = opening.library.open_file(path).await.unwrap();

    let place = opening
        .library
        .book_place(to_read.book)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(
        (
            place.title.as_str(),
            place.series_title.as_str(),
            place.is_in_library
        ),
        ("Odd Tale", "Loose Comics", false)
    );
}

#[tokio::test]
async fn adds_the_folder_of_a_file_opened_from_outside_the_library() {
    let opening = Opening::new("add-opened-folder").await;
    let path = opening.file("Loose Comics", "Odd Tale.cbz", SEED);
    let to_read = opening.library.open_file(path).await.unwrap();

    let scan = opening
        .library
        .add_opened_book_folder(to_read.book, |_| {})
        .await
        .unwrap();
    let reopened = opening
        .library
        .open_file(
            opening
                .outside
                .path()
                .join("Loose Comics")
                .join("Odd Tale.cbz"),
        )
        .await
        .unwrap();

    assert_eq!(
        (
            scan.books,
            reopened.is_in_library,
            opening.listed_series().await
        ),
        (1, true, 1)
    );
}

#[tokio::test]
async fn refuses_to_add_the_folder_of_a_book_the_library_already_holds() {
    let opening = Opening::new("add-held-folder").await;
    let folder = opening.outside.path().join("Held Comics");
    write_book(&folder.join("Held Tale.cbz"), SEED);
    opening
        .library
        .add_folder(folder.clone(), |_| {})
        .await
        .unwrap();
    let held = opening
        .library
        .open_file(folder.join("Held Tale.cbz"))
        .await
        .unwrap();

    let added = opening
        .library
        .add_opened_book_folder(held.book, |_| {})
        .await;

    assert!(matches!(
        added,
        Err(omnileaf_engine::LibraryError::BookNotFound { .. })
    ));
}
