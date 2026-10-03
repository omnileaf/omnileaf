#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{fs, path::Path};

use omnileaf_db::{
    catalog::{PageRequest, PageSize, SeriesOrder, SeriesSummary, series_books, series_page},
    rusqlite::{Connection, OpenFlags},
};
use omnileaf_engine::{Clock, FolderId, FolderScan, Library, LibraryError, ScanProgress};
use omnileaf_testkit::{
    ArchiveEntry, Compression, PageShape, SAMPLE_LIBRARY_NAME, cbz, page_png, write_sample_library,
};
use support::TempFolder;

const NOW_UNIX_MS: u64 = 1_790_000_000_000;
const DATABASE_FILE: &str = "library.sqlite";

struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
}

struct Scanned {
    library: Library,
    home: TempFolder,
    id: FolderId,
}

impl Scanned {
    async fn folder(name: &str, folder: &Path) -> (Self, FolderScan, Vec<ScanProgress>) {
        let home = TempFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library.add_folder(folder.to_path_buf()).await.unwrap();
        let page = library.folders(None).await.unwrap();
        let id = page.folders.last().unwrap().id;
        let scanned = Self { library, home, id };
        let (scan, progress) = scanned.scan_again().await;
        (scanned, scan, progress)
    }

    async fn scan_again(&self) -> (FolderScan, Vec<ScanProgress>) {
        let mut progress = Vec::new();
        let scan = self
            .library
            .scan_folder(self.id, |step| progress.push(step))
            .await
            .unwrap();
        (scan, progress)
    }

    fn series(&self) -> Vec<(String, u32)> {
        self.series_summaries()
            .into_iter()
            .map(|series| (series.title, series.book_count))
            .collect()
    }

    fn books_in(&self, title: &str) -> Vec<String> {
        let series = self
            .series_summaries()
            .into_iter()
            .find(|series| series.title == title)
            .unwrap();
        series_books(&self.connection(), series.id, &whole_page())
            .unwrap()
            .items
            .into_iter()
            .map(|book| book.title)
            .collect()
    }

    fn series_summaries(&self) -> Vec<SeriesSummary> {
        series_page(&self.connection(), SeriesOrder::Title, &whole_page())
            .unwrap()
            .items
    }

    fn connection(&self) -> Connection {
        Connection::open_with_flags(
            self.home.path().join(DATABASE_FILE),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap()
    }
}

fn whole_page() -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(PageSize::MAX).unwrap(),
    }
}

fn write_book(path: &Path, seed: u64) {
    write_book_with(path, seed, None);
}

fn write_book_with(path: &Path, seed: u64, comic_info: Option<&str>) {
    let mut entries: Vec<ArchiveEntry> = (0..2)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.png", index + 1),
            bytes: page_png(seed, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    if let Some(xml) = comic_info {
        entries.push(ArchiveEntry {
            name: "ComicInfo.xml".to_owned(),
            bytes: xml.as_bytes().to_vec(),
        });
    }
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

fn write_page(folder: &Path, seed: u64) {
    fs::create_dir_all(folder).unwrap();
    fs::write(
        folder.join("001.png"),
        page_png(seed, 0, PageShape::Portrait).unwrap(),
    )
    .unwrap();
}

fn sample_library(name: &str) -> TempFolder {
    let folder = TempFolder::new(name);
    write_sample_library(folder.path()).unwrap();
    folder
}

fn owned(rows: &[(&str, u32)]) -> Vec<(String, u32)> {
    rows.iter()
        .map(|(title, books)| ((*title).to_owned(), *books))
        .collect()
}

#[tokio::test]
async fn scans_each_series_folder_into_a_series_of_its_books() {
    let comics = sample_library("scan-sample");

    let (scanned, scan, _) =
        Scanned::folder("scan-sample", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    assert_eq!(
        scanned.series(),
        owned(&[
            ("Sample Series 01", 3),
            ("Sample Series 02", 2),
            ("Sample Series 03", 2)
        ])
    );
    assert_eq!(
        scan,
        FolderScan {
            name: SAMPLE_LIBRARY_NAME.to_owned(),
            series: 3,
            books: 7,
            unreadable_books: 0,
            unreadable_folders: 0,
        }
    );
}

#[tokio::test]
async fn reports_progress_from_no_books_up_to_every_book_found() {
    let comics = sample_library("scan-progress");

    let (_, _, progress) =
        Scanned::folder("scan-progress", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    assert_eq!(
        progress.first(),
        Some(&ScanProgress {
            scanned: 0,
            total: 7
        })
    );
    assert_eq!(
        progress.last(),
        Some(&ScanProgress {
            scanned: 7,
            total: 7
        })
    );
    assert!(progress.is_sorted_by_key(|step| step.scanned));
}

#[tokio::test]
async fn makes_a_book_at_the_top_of_the_folder_its_own_series() {
    let comics = TempFolder::new("scan-one-shots");
    write_book(&comics.path().join("Sample One-Shot.cbz"), 1);
    write_page(&comics.path().join("Sample Chapter"), 2);

    let (scanned, _, _) = Scanned::folder("scan-one-shots", comics.path()).await;

    assert_eq!(
        scanned.series(),
        owned(&[("Sample Chapter", 1), ("Sample One-Shot", 1)])
    );
}

#[tokio::test]
async fn leaves_out_macos_resource_folders_and_hidden_files() {
    let comics = TempFolder::new("scan-clutter");
    for (path, seed) in [
        ("Sample Series 01/v01.cbz", 1),
        ("Sample Series 01/.v02.cbz", 2),
        (".Sample Hidden/v01.cbz", 3),
        ("__MACOSX/Sample Series 01/v01.cbz", 4),
    ] {
        write_book(&comics.path().join(path), seed);
    }

    let (scanned, scan, _) = Scanned::folder("scan-clutter", comics.path()).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 01", 1)]));
    assert_eq!(scan.books, 1);
}

#[tokio::test]
async fn counts_the_books_it_cannot_read_and_carries_on() {
    let comics = TempFolder::new("scan-damaged").with_files(&["Sample Series 01/v02.cbz"]);
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);

    let (scanned, scan, _) = Scanned::folder("scan-damaged", comics.path()).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 01", 1)]));
    assert_eq!((scan.books, scan.unreadable_books), (1, 1));
}

#[tokio::test]
async fn titles_and_orders_books_by_file_name_whatever_their_comic_info_titles() {
    let comics = TempFolder::new("scan-titles");
    for (name, seed, story) in [
        ("v01", 1, "Sample Zebra Story"),
        ("v02", 2, "Sample Apple Story"),
    ] {
        write_book_with(
            &comics.path().join(format!("Sample Series 01/{name}.cbz")),
            seed,
            Some(&format!("<ComicInfo><Title>{story}</Title></ComicInfo>")),
        );
    }

    let (scanned, _, _) = Scanned::folder("scan-titles", comics.path()).await;

    assert_eq!(scanned.books_in("Sample Series 01"), ["v01", "v02"]);
}

#[tokio::test]
async fn titles_a_folder_of_images_by_its_whole_name_dots_included() {
    let comics = TempFolder::new("scan-dotted-chapters");
    for (chapter, seed) in [("Ch 10.5", 1), ("Ch 10.6", 2)] {
        write_page(&comics.path().join("Sample Series 01").join(chapter), seed);
    }

    let (scanned, _, _) = Scanned::folder("scan-dotted-chapters", comics.path()).await;

    assert_eq!(scanned.books_in("Sample Series 01"), ["Ch 10.5", "Ch 10.6"]);
}

#[tokio::test]
async fn leaves_out_a_cover_image_beside_the_books_of_a_series() {
    let comics = TempFolder::new("scan-series-cover");
    let series = comics.path().join("Sample Series 01");
    write_book(&series.join("v01.cbz"), 1);
    fs::write(
        series.join("cover.jpg"),
        page_png(2, 0, PageShape::Portrait).unwrap(),
    )
    .unwrap();

    let (scanned, scan, _) = Scanned::folder("scan-series-cover", comics.path()).await;

    assert_eq!(scanned.books_in("Sample Series 01"), ["v01"]);
    assert_eq!(scan.books, 1);
}

#[tokio::test]
async fn counts_only_the_series_that_hold_the_books_found() {
    let comics = TempFolder::new("scan-duplicate-book");
    for series in ["Sample Series 01", "Sample Series 02"] {
        write_book(&comics.path().join(series).join("v01.cbz"), 1);
    }

    let (scanned, scan, _) = Scanned::folder("scan-duplicate-book", comics.path()).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 01", 1)]));
    assert_eq!(scan.series, 1);
}

#[tokio::test]
async fn keeps_one_book_per_file_when_a_folder_is_scanned_again() {
    let comics = sample_library("scan-twice");
    let (scanned, first, _) =
        Scanned::folder("scan-twice", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    let (again, _) = scanned.scan_again().await;

    assert_eq!(again, first);
    assert_eq!(
        scanned.series(),
        owned(&[
            ("Sample Series 01", 3),
            ("Sample Series 02", 2),
            ("Sample Series 03", 2)
        ])
    );
}

#[tokio::test]
async fn refuses_to_scan_a_folder_missing_from_the_library() {
    let comics = sample_library("scan-removed");
    let (scanned, _, _) =
        Scanned::folder("scan-removed", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;
    scanned.library.remove_folder(scanned.id).await.unwrap();

    let outcome = scanned.library.scan_folder(scanned.id, |_| {}).await;

    assert!(matches!(outcome, Err(LibraryError::FolderNotFound { id }) if id == scanned.id));
}
