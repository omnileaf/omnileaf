#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookDetails, BookFile, Inclusion, NewRoot, NewSeries, PageRequest, PageSize, RootId,
        RootKind, RootLocator, ScannedBook, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort,
        add_root, record_moved_books, record_scanned_books, remove_book_files, remove_root,
        series_count, series_page,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const WHOLE_LIBRARY: u16 = 10;
const COPIED: &str = "Sample Series 01";
const UNCOPIED: &str = "Sample Series 02";
const ONLY_DUPLICATES: SeriesFilter = SeriesFilter {
    duplicates: Inclusion::Only,
    ..SeriesFilter::NONE
};
const VOLUME_01: BookCopy = book_copy(COPIED, 1, "Sample Series 01/Volume 01.cbz");
const VOLUME_01_RENAMED: BookCopy = book_copy(COPIED, 1, "Sample Series 01/Renamed copy.cbz");
const UNCOPIED_VOLUME_01: BookCopy = book_copy(UNCOPIED, 2, "Sample Series 02/Volume 01.cbz");

#[derive(Clone, Copy)]
struct BookCopy {
    series: &'static str,
    content: u32,
    location: &'static str,
}

const fn book_copy(series: &'static str, content: u32, location: &'static str) -> BookCopy {
    BookCopy {
        series,
        content,
        location,
    }
}

struct Library {
    database: Database,
    comics: RootId,
    backup: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let [comics, backup] = ["/media/Comics", "/media/Backup"].map(|path| NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(path)),
            added_at_ms: MODIFIED_AT_MS,
        });
        let (comics, backup) = database
            .write(move |transaction| {
                Ok((
                    add_root(transaction, &comics)?,
                    add_root(transaction, &backup)?,
                ))
            })
            .await
            .unwrap();
        Self {
            database,
            comics,
            backup,
            _folder: folder,
        }
    }

    async fn copied_into_a_second_folder(name: &str) -> Self {
        let library = Self::open(name).await;
        library
            .add(library.comics, &[VOLUME_01, UNCOPIED_VOLUME_01])
            .await;
        library.add(library.backup, &[VOLUME_01_RENAMED]).await;
        library
    }

    async fn add(&self, root: RootId, copies: &[BookCopy]) {
        let scanned: Vec<ScannedBook> = copies.iter().map(|copy| scanned(root, copy)).collect();
        self.database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn move_into(&self, root: RootId, copy: BookCopy) {
        let moved = [scanned(root, &copy)];
        self.database
            .write(move |transaction| record_moved_books(transaction, &moved))
            .await
            .unwrap();
    }

    async fn remove(&self, root: RootId, copy: BookCopy) {
        let locations = [PathBuf::from(copy.location)];
        self.database
            .write(move |transaction| remove_book_files(transaction, root, &locations))
            .await
            .unwrap();
    }

    async fn titles(&self, filter: SeriesFilter) -> Vec<String> {
        let listing = SeriesListing {
            sort: SeriesSort::ascending(SeriesOrder::Title),
            filter,
        };
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(WHOLE_LIBRARY).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| series_page(connection, &listing, &request))
            .await
            .unwrap();
        page.items.into_iter().map(|series| series.title).collect()
    }
}

fn scanned(root: RootId, copy: &BookCopy) -> ScannedBook {
    let page = ImageEntry {
        crc32: copy.content,
        size: 100,
    };
    ScannedBook {
        series: NewSeries::local(copy.series, MODIFIED_AT_MS).unwrap(),
        fingerprint: Fingerprint::pmf1([page]).unwrap(),
        title: format!("Volume {:02}", copy.content),
        added_at_ms: MODIFIED_AT_MS,
        page_count: 1,
        details: BookDetails::default(),
        file: BookFile {
            root,
            location: PathBuf::from(copy.location),
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
        },
    }
}

#[tokio::test]
async fn lists_only_the_series_holding_a_book_stored_in_two_folders() {
    let library = Library::copied_into_a_second_folder("duplicates-listed").await;

    let titles = library.titles(ONLY_DUPLICATES).await;

    assert_eq!(titles, [COPIED]);
}

#[tokio::test]
async fn counts_only_the_series_holding_a_book_stored_in_two_folders() {
    let library = Library::copied_into_a_second_folder("duplicates-counted").await;

    let count = library
        .database
        .read(|connection| series_count(connection, &ONLY_DUPLICATES))
        .await
        .unwrap();

    assert_eq!(count, 1);
}

#[tokio::test]
async fn hides_the_series_holding_a_book_stored_twice() {
    let library = Library::copied_into_a_second_folder("duplicates-hidden").await;
    let filter = SeriesFilter {
        duplicates: Inclusion::Hide,
        ..SeriesFilter::NONE
    };

    let titles = library.titles(filter).await;

    assert_eq!(titles, [UNCOPIED]);
}

#[tokio::test]
async fn lists_a_series_holding_a_renamed_copy_in_the_same_folder() {
    let library = Library::open("duplicates-in-one-folder").await;
    let copies = [VOLUME_01, VOLUME_01_RENAMED, UNCOPIED_VOLUME_01];
    library.add(library.comics, &copies).await;

    let titles = library.titles(ONLY_DUPLICATES).await;

    assert_eq!(titles, [COPIED]);
}

#[tokio::test]
async fn leaves_out_a_series_once_its_copy_is_removed() {
    let library = Library::copied_into_a_second_folder("duplicate-removed").await;

    library.remove(library.backup, VOLUME_01_RENAMED).await;

    assert_eq!(library.titles(ONLY_DUPLICATES).await, Vec::<String>::new());
}

#[tokio::test]
async fn leaves_out_a_series_once_the_folder_holding_both_copies_is_removed() {
    let library = Library::copied_into_a_second_folder("duplicates-folder-removed").await;
    let volume_03 = [
        book_copy(COPIED, 3, "Sample Series 01/Volume 03.cbz"),
        book_copy(COPIED, 3, "Sample Series 01/Volume 03 (copy).cbz"),
    ];
    library.add(library.backup, &volume_03).await;
    library.remove(library.backup, VOLUME_01_RENAMED).await;

    let backup = library.backup;
    library
        .database
        .write(move |transaction| remove_root(transaction, backup))
        .await
        .unwrap();

    assert_eq!(library.titles(ONLY_DUPLICATES).await, Vec::<String>::new());
}

#[tokio::test]
async fn lists_the_series_a_copied_book_moves_into_rather_than_the_one_it_left() {
    let library = Library::copied_into_a_second_folder("duplicate-moved").await;
    let volume_04 = book_copy(COPIED, 4, "Sample Series 01/Volume 04.cbz");
    library.add(library.comics, &[volume_04]).await;

    library
        .move_into(library.comics, book_copy(UNCOPIED, 1, VOLUME_01.location))
        .await;

    assert_eq!(library.titles(ONLY_DUPLICATES).await, [UNCOPIED]);
}
