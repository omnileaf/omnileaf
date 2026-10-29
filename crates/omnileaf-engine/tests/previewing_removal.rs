#![expect(
    clippy::unwrap_used,
    reason = "each test previews removals from its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests only use the fake that trashes every file"
)]
mod disposal;
#[expect(
    dead_code,
    reason = "these tests count the books of each series, never read their titles"
)]
mod scanned;
mod support;

use std::path::PathBuf;

use books::write_book;
use disposal::FakeDisposal;
use omnileaf_db::rusqlite::Connection;
use omnileaf_engine::{
    BookId, FileFate, Library, LibraryListing, RemovalPreview, RemovalReport, RemovalTarget,
    SeriesBookListing, SeriesId,
};
use scanned::{Scanned, owned};
use support::ScratchFolder;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";

struct Previewing {
    scanned: Scanned,
    comics: ScratchFolder,
}

impl Previewing {
    async fn new(name: &str) -> Self {
        let comics = ScratchFolder::new(name);
        write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
        write_book(&comics.path().join(SERIES_01).join("v02.cbz"), 2);
        write_book(&comics.path().join(SERIES_02).join("v01.cbz"), 3);
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    async fn holding(name: &str, books: &[(&str, u64)]) -> Self {
        let comics = ScratchFolder::new(name);
        for (series, seed) in books {
            write_book(&comics.path().join(series).join("v01.cbz"), *seed);
        }
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    fn library(&self) -> &Library {
        &self.scanned.library
    }

    fn path(&self, location: &str) -> PathBuf {
        self.comics.path().join(location)
    }

    async fn series(&self, title: &str) -> SeriesId {
        self.library()
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn books(&self, title: &str) -> Vec<BookId> {
        let series = self.series(title).await;
        self.library()
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap()
            .books
            .into_iter()
            .map(|book| book.id)
            .collect()
    }

    async fn also_link_a_copy_of(&self, name: &str, series: &str, seed: u64) -> ScratchFolder {
        let backup = ScratchFolder::new(name);
        write_book(&backup.path().join(series).join("v01.cbz"), seed);
        self.library()
            .add_folder(backup.path().to_path_buf(), |_| {})
            .await
            .unwrap();
        backup
    }

    async fn preview(&self, targets: &[RemovalTarget]) -> RemovalPreview {
        self.library().preview_removal(targets).await.unwrap()
    }

    async fn delete(&self, targets: &[RemovalTarget]) -> RemovalReport {
        self.library()
            .remove_from_library(targets, FileFate::Dispose(&FakeDisposal::default()))
            .await
            .unwrap()
    }

    fn registers(&self) -> u32 {
        self.scanned
            .connection()
            .query_row("SELECT count(*) FROM sync_register", [], |row| row.get(0))
            .unwrap()
    }

    fn markers(&self) -> u32 {
        self.scanned
            .connection()
            .query_row("SELECT count(*) FROM book_removed", [], |row| row.get(0))
            .unwrap()
    }
}

fn data_version(connection: &Connection) -> i64 {
    connection
        .pragma_query_value(None, "data_version", |row| row.get(0))
        .unwrap()
}

const fn preview(books: u32, files: u32, folders: u32) -> RemovalPreview {
    RemovalPreview {
        books,
        files,
        folders,
    }
}

#[tokio::test]
async fn previews_a_series_as_its_books_files_and_folders() {
    let previewing = Previewing::new("preview-series").await;
    let series = previewing.series(SERIES_01).await;

    let previewed = previewing
        .preview(&[RemovalTarget::Series { id: series }])
        .await;

    assert_eq!(previewed, preview(2, 2, 1));
}

#[tokio::test]
async fn previews_a_book_held_in_two_folders_as_two_files_in_two_folders() {
    let previewing = Previewing::new("preview-two-folders").await;
    let _backup = previewing
        .also_link_a_copy_of("preview-two-folders-backup", SERIES_02, 3)
        .await;
    let book = previewing.books(SERIES_02).await[0];

    let previewed = previewing
        .preview(&[RemovalTarget::Book { id: book }])
        .await;

    assert_eq!(previewed, preview(1, 2, 2));
}

#[tokio::test]
async fn counts_two_copies_in_one_folder_as_two_files_in_one_folder() {
    let previewing = Previewing::new("preview-two-copies").await;
    write_book(&previewing.path("Sample Series 02/copy/v01.cbz"), 3);
    let library = previewing.library();
    let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
    library.rescan_folder(linked.id, |_| {}).await.unwrap();
    let book = previewing.books(SERIES_02).await[0];

    let previewed = previewing
        .preview(&[RemovalTarget::Book { id: book }])
        .await;

    assert_eq!(previewed, preview(1, 2, 1));
}

#[tokio::test]
async fn counts_a_book_once_when_its_series_and_the_book_are_both_named() {
    let previewing = Previewing::new("preview-series-and-book").await;
    let series = previewing.series(SERIES_01).await;
    let book = previewing.books(SERIES_01).await[0];

    let previewed = previewing
        .preview(&[
            RemovalTarget::Book { id: book },
            RemovalTarget::Series { id: series },
        ])
        .await;

    assert_eq!(previewed, preview(2, 2, 1));
}

#[tokio::test]
async fn counts_a_series_named_twice_once() {
    let previewing = Previewing::new("preview-series-twice").await;
    let series = RemovalTarget::Series {
        id: previewing.series(SERIES_01).await,
    };

    let previewed = previewing.preview(&[series, series]).await;

    assert_eq!(previewed, preview(2, 2, 1));
}

#[tokio::test]
async fn counts_nothing_for_targets_the_library_does_not_hold_and_is_not_an_error() {
    let previewing = Previewing::new("preview-unknown").await;
    let elsewhere = Previewing::holding("preview-unknown-elsewhere", &[(SERIES_02, 99)]).await;
    let targets = [
        RemovalTarget::Book {
            id: elsewhere.books(SERIES_02).await[0],
        },
        RemovalTarget::Series {
            id: elsewhere.series(SERIES_02).await,
        },
    ];

    let previewed = previewing.preview(&targets).await;

    assert_eq!(previewed, preview(0, 0, 0));
}

#[tokio::test]
async fn counts_nothing_without_targets() {
    let previewing = Previewing::new("preview-no-targets").await;

    let previewed = previewing.preview(&[]).await;

    assert_eq!(previewed, preview(0, 0, 0));
}

#[tokio::test]
async fn gives_the_same_answer_when_asked_again() {
    let previewing = Previewing::new("preview-twice").await;
    let target = RemovalTarget::Series {
        id: previewing.series(SERIES_01).await,
    };
    let first = previewing.preview(&[target]).await;

    let again = previewing.preview(&[target]).await;

    assert_eq!((first, again), (preview(2, 2, 1), preview(2, 2, 1)));
}

#[tokio::test]
async fn counts_nothing_for_books_already_removed() {
    let previewing = Previewing::new("preview-after-removal").await;
    let target = RemovalTarget::Series {
        id: previewing.series(SERIES_01).await,
    };
    previewing.delete(&[target]).await;

    let previewed = previewing.preview(&[target]).await;

    assert_eq!(previewed, preview(0, 0, 0));
}

#[tokio::test]
async fn previews_a_book_removed_and_added_back_again() {
    let previewing = Previewing::new("preview-readded").await;
    let book = previewing.books(SERIES_02).await[0];
    previewing.delete(&[RemovalTarget::Book { id: book }]).await;
    previewing
        .library()
        .add_folder(previewing.comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    let previewed = previewing
        .preview(&[RemovalTarget::Book { id: book }])
        .await;

    assert_eq!(previewed, preview(1, 1, 1));
}

#[tokio::test]
async fn previews_what_a_delete_of_the_same_targets_then_removes() {
    let previewing = Previewing::new("preview-matches-delete").await;
    let _backup = previewing
        .also_link_a_copy_of("preview-matches-delete-backup", SERIES_02, 3)
        .await;
    let targets = [
        RemovalTarget::Series {
            id: previewing.series(SERIES_01).await,
        },
        RemovalTarget::Book {
            id: previewing.books(SERIES_02).await[0],
        },
    ];
    let previewed = previewing.preview(&targets).await;

    let report = previewing.delete(&targets).await;

    assert_eq!(previewed.books, report.removed_books);
    assert_eq!(
        usize::try_from(previewed.files).unwrap(),
        report.files.len()
    );
    assert_eq!(previewed, preview(3, 4, 2));
}

#[tokio::test]
async fn changes_nothing_in_the_catalog_and_writes_no_register() {
    let previewing = Previewing::new("preview-writes-nothing").await;
    let watching = previewing.scanned.connection();
    let targets = [
        RemovalTarget::Series {
            id: previewing.series(SERIES_01).await,
        },
        RemovalTarget::Book {
            id: previewing.books(SERIES_02).await[0],
        },
    ];
    let version = data_version(&watching);
    let registers = previewing.registers();

    previewing.preview(&targets).await;

    assert_eq!(data_version(&watching), version);
    assert_eq!(previewing.registers(), registers);
    assert_eq!(previewing.markers(), 0);
    assert_eq!(
        previewing.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
}
