#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::{Path, PathBuf};

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, Cover, NewRoot, NewSeries, PageRequest, PageSize, RootId, RootKind, RootLocator,
        ScannedBook, SeriesOrder, add_root, cover_file, record_scanned_books, remove_book_files,
        series_page,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const ROOT_FOLDER: &str = "/media/Sample Library";
const SERIES: &str = "Sample Series 01";

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(ROOT_FOLDER)),
            added_at_ms: ADDED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            database,
            root,
            _folder: folder,
        }
    }

    async fn record(&self, title: &str, page_crc: u32, size_bytes: u64) {
        let scanned = ScannedBook {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            fingerprint: fingerprint(page_crc),
            title: title.to_owned(),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root: self.root,
                location: location_of(title),
                size_bytes,
                modified_at_ms: MODIFIED_AT_MS,
            },
        };
        self.database
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
    }

    async fn listed_cover(&self) -> Option<Cover> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
            .await
            .unwrap();
        page.items.first().unwrap().cover
    }

    async fn file_of(&self, cover: Cover) -> Option<PathBuf> {
        self.database
            .read(move |connection| cover_file(connection, &cover))
            .await
            .unwrap()
    }
}

fn fingerprint(page_crc: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: page_crc,
        size: 1,
    }])
    .unwrap()
}

fn location_of(title: &str) -> PathBuf {
    Path::new(SERIES).join(format!("{title}.cbz"))
}

#[tokio::test]
async fn lists_each_series_with_the_cover_of_its_first_book_by_title() {
    let library = Library::open("cover-first-book").await;
    library.record("Volume 02", 2, 200).await;
    library.record("Volume 01", 1, 100).await;

    let cover = library.listed_cover().await.unwrap();

    assert_eq!(cover.book, BookId::local(&fingerprint(1)));
    assert_eq!(cover.rev, 1);
}

#[tokio::test]
async fn finds_the_file_a_listed_cover_is_read_from() {
    let library = Library::open("cover-file").await;
    library.record("Volume 01", 1, 100).await;
    let cover = library.listed_cover().await.unwrap();

    let file = library.file_of(cover).await;

    assert_eq!(
        file,
        Some(Path::new(ROOT_FOLDER).join(location_of("Volume 01")))
    );
}

#[tokio::test]
async fn lists_a_new_cover_once_its_file_changes() {
    let library = Library::open("cover-changed").await;
    library.record("Volume 01", 1, 100).await;
    let before = library.listed_cover().await.unwrap();

    library.record("Volume 01", 1, 150).await;

    let after = library.listed_cover().await.unwrap();
    assert_eq!(after.rev, before.rev + 1);
    assert_eq!(library.file_of(before).await, None);
}

#[tokio::test]
async fn finds_no_file_for_a_cover_whose_file_has_gone() {
    let library = Library::open("cover-gone").await;
    library.record("Volume 01", 1, 100).await;
    let cover = library.listed_cover().await.unwrap();
    let root = library.root;
    library
        .database
        .write(move |transaction| remove_book_files(transaction, root, &[location_of("Volume 01")]))
        .await
        .unwrap();

    let file = library.file_of(cover).await;

    assert_eq!(file, None);
}
