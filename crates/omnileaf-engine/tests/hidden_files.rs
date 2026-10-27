#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests read the books of a series, never how many series there are"
)]
mod scanned;
mod support;

use std::{fs, path::PathBuf};

use books::write_book;
use omnileaf_engine::{
    BookFile, BookId, FileChanges, FileType, FolderScan, Library, LibraryError, LibraryListing,
    RescanOutcome, SeriesBookListing,
};
use scanned::Scanned;
use support::ScratchFolder;

const SERIES: &str = "Sample Series 01";
const SERIES_ADDED_LATER: &str = "Sample Series 02";
const RAR_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";

struct Hiding {
    scanned: Scanned,
    comics: ScratchFolder,
}

impl Hiding {
    async fn new(name: &str) -> Self {
        let comics = ScratchFolder::new(name);
        write_book(&comics.path().join(SERIES).join("v01.cbz"), 1);
        write_book(&comics.path().join(SERIES).join("v02.cbr"), 2);
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    fn file(&self, name: &str) -> PathBuf {
        self.comics.path().join(SERIES).join(name)
    }

    fn write_rar(&self, name: &str) {
        fs::write(self.file(name), RAR_SIGNATURE).unwrap();
    }

    fn library(&self) -> &Library {
        &self.scanned.library
    }

    async fn book(&self, title: &str) -> BookId {
        let library = self.library();
        let series = library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .first()
            .unwrap()
            .id;
        library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap()
            .books
            .into_iter()
            .find(|book| book.title == title)
            .unwrap()
            .id
    }

    async fn hide_like(&self, title: &str) -> FileType {
        let book = self.book(title).await;
        self.library().hide_files_like(book).await.unwrap()
    }

    async fn add_later(&self, folder: &ScratchFolder) -> FolderScan {
        self.library()
            .add_folder(folder.path().to_path_buf(), |_| {})
            .await
            .unwrap()
    }

    async fn rescan(&self) -> RescanOutcome {
        self.library()
            .rescan_folder(self.scanned.id, |_| {})
            .await
            .unwrap()
            .outcome
    }
}

#[tokio::test]
async fn hides_files_of_a_type_the_app_does_not_read_like_a_book_s() {
    let hiding = Hiding::new("hide-cbr").await;

    let hidden = hiding.hide_like("v02").await;

    assert_eq!(hidden.to_string(), "cbr");
}

#[tokio::test]
async fn keeps_readable_files_of_a_hidden_type_in_the_library_once_it_rescans() {
    let hiding = Hiding::new("hide-readable-kept").await;
    hiding.hide_like("v02").await;

    hiding.rescan().await;

    assert_eq!(hiding.scanned.books_in(SERIES), ["v01", "v02"]);
}

#[tokio::test]
async fn stops_counting_unreadable_files_of_a_hidden_type_once_it_rescans() {
    let hiding = Hiding::new("hide-uncounted").await;
    hiding.write_rar("v03.cbr");
    hiding.hide_like("v02").await;

    let outcome = hiding.rescan().await;

    assert_eq!(outcome, RescanOutcome::Rescanned(FileChanges::default()));
}

#[tokio::test]
async fn removes_a_book_whose_file_of_a_hidden_type_no_longer_opens_once_it_rescans() {
    let hiding = Hiding::new("hide-turned-rar").await;
    hiding.hide_like("v02").await;
    hiding.write_rar("v02.cbr");

    let outcome = hiding.rescan().await;

    assert_eq!(
        outcome,
        RescanOutcome::Rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(hiding.scanned.books_in(SERIES), ["v01"]);
}

#[tokio::test]
async fn rescans_a_folder_left_with_only_hidden_files_rather_than_finding_it_empty() {
    let hiding = Hiding::new("hide-only-hidden-left").await;
    hiding.hide_like("v02").await;
    hiding.write_rar("v03.cbr");
    for name in ["v01.cbz", "v02.cbr"] {
        fs::remove_file(hiding.file(name)).unwrap();
    }

    let outcome = hiding.rescan().await;

    assert_eq!(
        outcome,
        RescanOutcome::Rescanned(FileChanges {
            removed: 2,
            ..FileChanges::default()
        })
    );
}

#[tokio::test]
async fn leaves_files_of_a_hidden_type_out_of_a_folder_added_later() {
    let hiding = Hiding::new("hide-added").await;
    hiding.hide_like("v02").await;
    let later = ScratchFolder::new("hide-added-later");
    write_book(&later.path().join(SERIES_ADDED_LATER).join("v01.cbz"), 3);
    fs::write(
        later.path().join(SERIES_ADDED_LATER).join("v02.cbr"),
        RAR_SIGNATURE,
    )
    .unwrap();

    let scan = hiding.add_later(&later).await;

    assert_eq!((scan.books, scan.unsupported_books), (1, 0));
}

#[tokio::test]
async fn finds_readable_files_of_a_hidden_type_in_a_folder_added_later() {
    let hiding = Hiding::new("hide-added-readable").await;
    hiding.hide_like("v02").await;
    let later = ScratchFolder::new("hide-added-readable-later");
    write_book(&later.path().join(SERIES_ADDED_LATER).join("v01.cbr"), 3);
    fs::write(
        later.path().join(SERIES_ADDED_LATER).join("v02.cbr"),
        RAR_SIGNATURE,
    )
    .unwrap();

    let scan = hiding.add_later(&later).await;

    assert_eq!((scan.books, scan.unsupported_books), (1, 0));
}

#[tokio::test]
async fn counts_a_damaged_file_of_a_hidden_type_as_unreadable() {
    let hiding = Hiding::new("hide-added-damaged").await;
    hiding.hide_like("v02").await;
    let later = ScratchFolder::new("hide-added-damaged-later");
    write_book(&later.path().join(SERIES_ADDED_LATER).join("v01.cbz"), 3);
    fs::write(later.path().join(SERIES_ADDED_LATER).join("v02.cbr"), b"").unwrap();

    let scan = hiding.add_later(&later).await;

    assert_eq!((scan.books, scan.unreadable_books), (1, 1));
}

#[tokio::test]
async fn lists_no_file_of_a_hidden_type_among_those_a_scan_skips() {
    let hiding = Hiding::new("hide-skipped").await;
    hiding.hide_like("v02").await;
    let later = ScratchFolder::new("hide-skipped-later");
    later.write("Sample Series 02/v01.cbr", RAR_SIGNATURE);

    let scan = hiding.add_later(&later).await;

    assert_eq!(scan.skipped_types, []);
}

#[tokio::test]
async fn counts_unreadable_files_of_a_type_shown_again() {
    let hiding = Hiding::new("hide-undone").await;
    hiding.write_rar("v03.cbr");
    let hidden = hiding.hide_like("v02").await;
    hiding.library().show_file_type(hidden).await.unwrap();

    let outcome = hiding.rescan().await;

    assert_eq!(
        outcome,
        RescanOutcome::Rescanned(FileChanges {
            unsupported_books: 1,
            ..FileChanges::default()
        })
    );
}

#[tokio::test]
async fn hides_a_file_type_a_scan_skipped_so_rescans_skip_its_files_no_more() {
    let comics = ScratchFolder::new("hide-skipped-type");
    write_book(&comics.path().join(SERIES).join("v01.cbz"), 1);
    comics.write(&format!("{SERIES}/v02.cbr"), RAR_SIGNATURE);
    let (scanned, scan, _) = Scanned::folder("hide-skipped-type", comics.path()).await;
    let skipped = scan.skipped_types.first().unwrap().file_type.clone();

    scanned.library.hide_file_type(skipped).await.unwrap();
    let rescan = scanned
        .library
        .rescan_folder(scanned.id, |_| {})
        .await
        .unwrap();

    assert_eq!(
        (rescan.outcome, rescan.skipped_types),
        (RescanOutcome::Rescanned(FileChanges::default()), Vec::new())
    );
}

#[tokio::test]
async fn hides_plain_rar_files_as_a_type_the_app_does_not_read() {
    let hiding = Hiding::new("hide-type-rar").await;
    let rar = FileType::try_from("rar".to_owned()).unwrap();

    let hidden = hiding.library().hide_file_type(rar).await;

    assert!(hidden.is_ok(), "{hidden:?}");
}

#[tokio::test]
async fn refuses_to_hide_a_file_type_the_app_reads() {
    let hiding = Hiding::new("hide-type-read").await;
    let read = FileType::try_from("cbz".to_owned()).unwrap();

    let hidden = hiding.library().hide_file_type(read.clone()).await;

    assert!(
        matches!(&hidden, Err(LibraryError::ReadTypeKept { file_type }) if *file_type == read),
        "{hidden:?}"
    );
}

#[tokio::test]
async fn refuses_to_hide_files_of_a_type_the_app_reads() {
    let hiding = Hiding::new("hide-read").await;
    let book = hiding.book("v01").await;

    let hidden = hiding.library().hide_files_like(book).await;

    assert!(
        matches!(hidden, Err(LibraryError::FileTypeRead { id }) if id == book),
        "{hidden:?}"
    );
}

#[tokio::test]
async fn refuses_to_hide_files_like_a_book_the_library_does_not_hold() {
    let hiding = Hiding::new("hide-missing").await;
    let missing = BookId::try_from("0190a3e4-0000-8000-8000-00000000ffff".to_owned()).unwrap();

    let hidden = hiding.library().hide_files_like(missing).await;

    assert!(
        matches!(hidden, Err(LibraryError::BookNotFound { id }) if id == missing),
        "{hidden:?}"
    );
}

#[tokio::test]
async fn lists_the_file_types_hidden_in_order() {
    let hiding = Hiding::new("hidden-types-listed").await;
    let rar = FileType::try_from("rar".to_owned()).unwrap();
    hiding.library().hide_file_type(rar).await.unwrap();
    hiding.hide_like("v02").await;

    let hidden = hiding.library().hidden_types().await.unwrap();

    assert_eq!(
        hidden.iter().map(FileType::to_string).collect::<Vec<_>>(),
        ["cbr", "rar"]
    );
}

#[tokio::test]
async fn lists_a_file_type_no_more_once_it_is_shown_again() {
    let hiding = Hiding::new("hidden-types-shown").await;
    let hidden = hiding.hide_like("v02").await;
    hiding.library().show_file_type(hidden).await.unwrap();

    let listed = hiding.library().hidden_types().await.unwrap();

    assert_eq!(listed, []);
}

#[tokio::test]
async fn names_a_book_s_file_and_its_type() {
    let hiding = Hiding::new("book-file-named").await;
    let book = hiding.book("v02").await;

    let file = hiding.library().book_file_name(book).await.unwrap();

    assert_eq!(
        file,
        Some(BookFile {
            name: "v02.cbr".to_owned(),
            file_type: FileType::try_from("cbr".to_owned()).ok(),
        })
    );
}

#[tokio::test]
async fn names_no_file_for_a_book_the_library_does_not_hold() {
    let hiding = Hiding::new("book-file-missing").await;
    let missing = BookId::try_from("0190a3e4-0000-8000-8000-00000000ffff".to_owned()).unwrap();

    let file = hiding.library().book_file_name(missing).await.unwrap();

    assert_eq!(file, None);
}
