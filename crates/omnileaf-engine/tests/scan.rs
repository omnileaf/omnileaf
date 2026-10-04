#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

mod books;
mod scanned;
mod support;

use std::fs;

use books::{write_book, write_book_with, write_page};
use omnileaf_db::rusqlite::types::Value;
use omnileaf_engine::{FileChanges, FolderScan, LibraryError, RescanOutcome, ScanProgress};
use omnileaf_sync_proto::SourceId;
use omnileaf_testkit::{
    PageShape, SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, page_png, write_sample_library,
};
use scanned::{Scanned, owned};
use support::TempFolder;

fn sample_library(name: &str) -> TempFolder {
    let folder = TempFolder::new(name);
    write_sample_library(folder.path()).unwrap();
    folder
}

fn series_sources(scanned: &Scanned) -> Vec<Value> {
    scanned
        .connection()
        .prepare("SELECT source_id FROM series ORDER BY local_id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
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
async fn files_every_series_found_under_the_local_library_source() {
    let comics = sample_library("scan-local-source");

    let (scanned, _, _) = Scanned::folder(
        "scan-local-source",
        &comics.path().join(SAMPLE_LIBRARY_NAME),
    )
    .await;

    let local = Value::Blob(SourceId::local().as_bytes().to_vec());
    assert_eq!(series_sources(&scanned), vec![local; SAMPLE_LIBRARY.len()]);
}

#[tokio::test]
async fn reports_finding_the_books_then_reading_each_one_found() {
    let comics = sample_library("scan-progress");

    let (_, _, progress) =
        Scanned::folder("scan-progress", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    assert_eq!(progress.first(), Some(&ScanProgress::Finding),);
    assert_eq!(
        progress.get(1),
        Some(&ScanProgress::Reading {
            scanned: 0,
            total: 7
        })
    );
    assert_eq!(
        progress.last(),
        Some(&ScanProgress::Reading {
            scanned: 7,
            total: 7
        })
    );
    assert!(progress.is_sorted_by_key(|step| match step {
        ScanProgress::Finding => None,
        ScanProgress::Reading { scanned, .. } => Some(*scanned),
    }));
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
    let (scanned, _, _) =
        Scanned::folder("scan-twice", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    let again = scanned
        .library
        .rescan_folder(scanned.id, |_| {})
        .await
        .unwrap();

    assert_eq!(
        again.outcome,
        RescanOutcome::Rescanned(FileChanges::default())
    );
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

    let outcome = scanned.library.rescan_folder(scanned.id, |_| {}).await;

    assert!(matches!(outcome, Err(LibraryError::FolderNotFound { id }) if id == scanned.id));
}

#[cfg(unix)]
#[tokio::test]
async fn does_not_follow_symbolic_links() {
    let target = TempFolder::new("scan-link-target");
    write_book(&target.path().join("Sample Series 01/v01.cbz"), 1);
    let comics = TempFolder::new("scan-with-link");
    std::os::unix::fs::symlink(target.path(), comics.path().join("Linked")).unwrap();

    let (_, scan, _) = Scanned::folder("scan-with-link", comics.path()).await;

    assert_eq!(scan.books, 0);
}

#[cfg(unix)]
#[tokio::test]
async fn counts_the_folders_it_cannot_read_and_carries_on() {
    use std::os::unix::fs::PermissionsExt;
    let comics = TempFolder::new("scan-locked");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    let locked = comics.path().join("Sample Series 02");
    write_book(&locked.join("v01.cbz"), 2);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    let (_, scan, _) = Scanned::folder("scan-locked", comics.path()).await;

    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!((scan.books, scan.unreadable_folders), (1, 1));
}

#[test]
fn tells_the_interface_each_stage_of_a_scan_by_name() {
    let stages = [
        ScanProgress::Finding,
        ScanProgress::Reading {
            scanned: 3,
            total: 7,
        },
    ];

    let sent = stages.map(|stage| serde_json::to_value(stage).unwrap());

    assert_eq!(
        sent,
        [
            serde_json::json!({ "stage": "finding" }),
            serde_json::json!({ "stage": "reading", "scanned": 3, "total": 7 }),
        ]
    );
}
