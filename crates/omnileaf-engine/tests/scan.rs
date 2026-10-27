#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

mod books;
mod details;
mod scanned;
mod support;

use std::{fs, path::Path};

use books::{write_book, write_book_with, write_page};
use details::stored_details;
use omnileaf_db::rusqlite::types::Value;
use omnileaf_engine::{
    FileChanges, FileType, FolderScan, LibraryError, RescanOutcome, ScanProgress, SkippedType,
};
use omnileaf_sync_proto::SourceId;
use omnileaf_testkit::{
    ArchiveEntry, Packing, PageShape, SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, cb7, page_png,
    write_sample_library,
};
use scanned::{Scanned, owned};
use support::ScratchFolder;

const FULL_COMIC_INFO: &str = "<ComicInfo>
    <Series>Sample Series 01</Series>
    <Number>1</Number>
    <Title>Sample Story</Title>
    <Volume>2</Volume>
    <Summary>A sample summary.</Summary>
    <Writer>Sample Author</Writer>
    <Penciller>Sample Artist, Second Artist</Penciller>
    <Inker>Sample Artist</Inker>
    <Colorist>Sample Colourist</Colorist>
    <Letterer>Sample Letterer</Letterer>
    <CoverArtist>Sample Cover Artist</CoverArtist>
    <Editor>Sample Editor</Editor>
    <Publisher>Sample Publisher</Publisher>
    <Genre>Mystery, Adventure</Genre>
    <Tags>harbour</Tags>
    <Format>Digital</Format>
    <LanguageISO>en</LanguageISO>
    <Manga>YesAndRightToLeft</Manga>
    <AgeRating>Adults Only 18+</AgeRating>
    <Year>2019</Year>
</ComicInfo>";

fn stored_names(scanned: &Scanned, sql: &str) -> Vec<(String, String)> {
    scanned
        .connection()
        .prepare(sql)
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn owned_pairs(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(code, name)| ((*code).to_owned(), (*name).to_owned()))
        .collect()
}

const RAR_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
const LOCATIONS_LISTED_PER_TYPE: usize = 20;

fn sample_library(name: &str) -> ScratchFolder {
    let folder = ScratchFolder::new(name);
    write_sample_library(folder.path()).unwrap();
    folder
}

const SERIES_04_FOLDER: &str = "Sample Author/Sample Series 04 (2019)";
const SERIES_04_ARCHIVES: &[&str] = &[
    "Volume 01/Sample Series 04 c001.cbz",
    "Volume 01/Sample Series 04 c002.5 [GroupName].cbz",
    "Sample Series 04 Vol. 07/Sample Series 04 c030.cbz",
    "Sample Series 04 v03 c017.cbz",
    "Sample Series 04 v04-06.cbz",
    "Sample Series 04 c020-022.cbz",
    "Sample Series 04 015.cbz",
    "Sample Series 04 Art Book.cbz",
    "Specials/Sample Series 04 Extras.cbz",
    "Specials/Sample Series 04 Omake 02.cbz",
];
const SERIES_04_IMAGE_FOLDERS: &[&str] = &["v02/003", "v02/Extra Pages"];
const STORED_NUMBERING: &str = "SELECT title, concat_ws(' ', kind, first_number, last_number,
    number_source, volume_number, volume_source) FROM book ORDER BY title";

fn series_laid_out_in_folders(name: &str) -> ScratchFolder {
    let comics = ScratchFolder::new(name);
    let series = comics.path().join(SERIES_04_FOLDER);
    for (book, seed) in SERIES_04_ARCHIVES.iter().zip(1..) {
        write_book(&series.join(book), seed);
    }
    for (book, seed) in SERIES_04_IMAGE_FOLDERS.iter().zip(20..) {
        write_page(&series.join(book), seed);
    }
    write_book(
        &comics
            .path()
            .join("Sample Author/Sample Series 05 Vol 2/c001.cbz"),
        30,
    );
    write_book(&comics.path().join("Sample One-Shot [GroupName].cbz"), 31);
    comics
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
            unsupported_books: 0,
            unreadable_folders: 0,
            skipped_types: Vec::new(),
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
async fn counts_the_books_a_folder_holds() {
    let comics = sample_library("scan-folder-count");

    let (scanned, _, _) = Scanned::folder(
        "scan-folder-count",
        &comics.path().join(SAMPLE_LIBRARY_NAME),
    )
    .await;

    assert_eq!(
        scanned.library.folder_book_count(scanned.id).await.unwrap(),
        7
    );
}

#[tokio::test]
async fn counts_a_book_held_twice_in_a_folder_once() {
    let comics = ScratchFolder::new("scan-folder-copies");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    write_book(&comics.path().join("Copies/v01.cbz"), 1);

    let (scanned, _, _) = Scanned::folder("scan-folder-copies", comics.path()).await;

    assert_eq!(
        scanned.library.folder_book_count(scanned.id).await.unwrap(),
        1
    );
}

#[tokio::test]
async fn names_the_folder_it_adds_before_finding_its_books() {
    let comics = sample_library("scan-adding");
    let folder = comics.path().join(SAMPLE_LIBRARY_NAME);

    let (_, _, progress) = Scanned::folder("scan-adding", &folder).await;

    assert_eq!(
        progress[..2],
        [
            ScanProgress::Adding {
                name: SAMPLE_LIBRARY_NAME.to_owned(),
                location: folder.display().to_string(),
            },
            ScanProgress::Finding { found: 0 },
        ]
    );
}

#[tokio::test]
async fn reports_finding_the_books_then_reading_each_one_found() {
    let comics = sample_library("scan-progress");

    let (_, _, progress) =
        Scanned::folder("scan-progress", &comics.path().join(SAMPLE_LIBRARY_NAME)).await;

    let scanning = &progress[1..];
    let reading = &scanning[finding_steps(&progress).len()..];
    assert_eq!(scanning.first(), Some(&ScanProgress::Finding { found: 0 }));
    assert_eq!(
        reading.first(),
        Some(&ScanProgress::Reading {
            scanned: 0,
            total: 7
        })
    );
    assert_eq!(
        reading.last(),
        Some(&ScanProgress::Reading {
            scanned: 7,
            total: 7
        })
    );
    assert!(reading.is_sorted_by_key(|step| match step {
        ScanProgress::Reading { scanned, .. } => Some(*scanned),
        ScanProgress::Adding { .. } | ScanProgress::Finding { .. } => None,
    }));
}

#[tokio::test]
async fn counts_the_books_found_so_far_until_all_are_found() {
    let comics = sample_library("scan-found-so-far");

    let (_, _, progress) = Scanned::folder(
        "scan-found-so-far",
        &comics.path().join(SAMPLE_LIBRARY_NAME),
    )
    .await;

    let found = finding_steps(&progress);
    assert!(found.windows(2).all(|pair| pair[0] < pair[1]));
    assert_eq!(found.last(), Some(&7));
}

fn finding_steps(progress: &[ScanProgress]) -> Vec<u32> {
    progress
        .iter()
        .skip_while(|step| matches!(step, ScanProgress::Adding { .. }))
        .map_while(|step| match step {
            ScanProgress::Finding { found } => Some(*found),
            ScanProgress::Adding { .. } | ScanProgress::Reading { .. } => None,
        })
        .collect()
}

#[tokio::test]
async fn makes_a_book_at_the_top_of_the_folder_its_own_series() {
    let comics = ScratchFolder::new("scan-one-shots");
    write_book(&comics.path().join("Sample One-Shot.cbz"), 1);
    write_page(&comics.path().join("Sample Chapter"), 2);

    let (scanned, _, _) = Scanned::folder("scan-one-shots", comics.path()).await;

    assert_eq!(
        scanned.series(),
        owned(&[("Sample Chapter", 1), ("Sample One-Shot", 1)])
    );
}

#[tokio::test]
async fn names_each_series_and_book_without_their_tags_or_the_series_year() {
    let comics = ScratchFolder::new("scan-tags");
    write_book(
        &comics
            .path()
            .join("Sample Series 04 (2019) [GroupName]/Sample Series 04 v01 [EN] (Digital).cbz"),
        1,
    );
    write_page(
        &comics.path().join("[GroupName] Sample One-Shot (Digital)"),
        2,
    );

    let (scanned, _, _) = Scanned::folder("scan-tags", comics.path()).await;

    assert_eq!(
        scanned.series(),
        owned(&[("Sample One-Shot", 1), ("Sample Series 04", 1)])
    );
    assert_eq!(
        scanned.books_in("Sample Series 04"),
        ["Sample Series 04 v01"]
    );
    assert_eq!(scanned.books_in("Sample One-Shot"), ["Sample One-Shot"]);
}

#[tokio::test]
async fn files_the_books_in_volume_and_specials_folders_in_the_series_holding_them() {
    let comics = series_laid_out_in_folders("scan-series-folders");

    let (scanned, _, _) = Scanned::folder("scan-series-folders", comics.path()).await;

    assert_eq!(
        scanned.series(),
        owned(&[
            ("Sample One-Shot", 1),
            ("Sample Series 04", 12),
            ("Sample Series 05 Vol 2", 1)
        ])
    );
}

#[tokio::test]
async fn orders_a_series_books_by_the_numbers_their_names_and_folders_give() {
    let comics = series_laid_out_in_folders("scan-reading-order");

    let (scanned, _, _) = Scanned::folder("scan-reading-order", comics.path()).await;

    assert_eq!(
        scanned.books_in("Sample Series 04"),
        [
            "Sample Series 04 c001",
            "Sample Series 04 c002.5",
            "003",
            "Extra Pages",
            "Sample Series 04 v03 c017",
            "Sample Series 04 v04-06",
            "Sample Series 04 c030",
            "Sample Series 04 015",
            "Sample Series 04 c020-022",
            "Sample Series 04 Omake 02",
            "Sample Series 04 Art Book",
            "Sample Series 04 Extras",
        ]
    );
}

#[tokio::test]
async fn stores_the_kind_and_numbers_each_book_is_filed_with_and_where_they_were_read() {
    let comics = series_laid_out_in_folders("scan-numbering");

    let (scanned, _, _) = Scanned::folder("scan-numbering", comics.path()).await;

    assert_eq!(
        stored_names(&scanned, STORED_NUMBERING),
        owned_pairs(&[
            ("003", "chapter 3000 3000 file_name 2000 folder_name"),
            ("Extra Pages", "chapter 2000 folder_name"),
            ("Sample One-Shot", "special"),
            ("Sample Series 04 015", "chapter 15000 15000 file_name"),
            ("Sample Series 04 Art Book", "special"),
            ("Sample Series 04 Extras", "special"),
            ("Sample Series 04 Omake 02", "special 2000 2000 file_name"),
            (
                "Sample Series 04 c001",
                "chapter 1000 1000 file_name 1000 folder_name"
            ),
            (
                "Sample Series 04 c002.5",
                "chapter 2500 2500 file_name 1000 folder_name"
            ),
            ("Sample Series 04 c020-022", "chapter 20000 22000 file_name"),
            (
                "Sample Series 04 c030",
                "chapter 30000 30000 file_name 7000 folder_name"
            ),
            (
                "Sample Series 04 v03 c017",
                "chapter 17000 17000 file_name 3000 file_name"
            ),
            ("Sample Series 04 v04-06", "volume 4000 6000 file_name"),
            ("c001", "chapter 1000 1000 file_name"),
        ])
    );
}

#[tokio::test]
async fn leaves_out_macos_resource_folders_and_hidden_files() {
    let comics = ScratchFolder::new("scan-clutter");
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
    let comics = ScratchFolder::new("scan-damaged");
    comics.write("Sample Series 01/v02.cbz", b"");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);

    let (scanned, scan, _) = Scanned::folder("scan-damaged", comics.path()).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 01", 1)]));
    assert_eq!((scan.books, scan.unreadable_books), (1, 1));
}

#[tokio::test]
async fn counts_the_rar_books_it_cannot_open_yet_apart_from_damaged_ones() {
    let comics = ScratchFolder::new("scan-not-yet");
    comics.write("Sample Series 01/v02.cbz", b"");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    fs::write(
        comics.path().join("Sample Series 01/v03.cbr"),
        b"Rar!\x1a\x07\x01\x00",
    )
    .unwrap();

    let (_, scan, _) = Scanned::folder("scan-not-yet", comics.path()).await;

    assert_eq!(
        (scan.books, scan.unreadable_books, scan.unsupported_books),
        (1, 1, 1)
    );
}

fn cbr() -> FileType {
    FileType::try_from("cbr".to_owned()).unwrap()
}

fn location_in_series(name: &str) -> String {
    Path::new("Sample Series 01")
        .join(name)
        .display()
        .to_string()
}

#[tokio::test]
async fn lists_a_file_it_skips_for_a_type_the_app_does_not_read() {
    let comics = ScratchFolder::new("scan-skipped");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    comics.write("Sample Series 01/v02.cbr", RAR_SIGNATURE);

    let (_, scan, _) = Scanned::folder("scan-skipped", comics.path()).await;

    assert_eq!(
        scan.skipped_types,
        [SkippedType {
            file_type: cbr(),
            files: 1,
            first_locations: vec![location_in_series("v02.cbr")],
        }]
    );
}

#[tokio::test]
async fn lists_a_plain_rar_file_among_the_files_it_skips() {
    let comics = ScratchFolder::new("scan-skipped-rar");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    comics.write("Sample Series 01/v02.rar", RAR_SIGNATURE);

    let (_, scan, _) = Scanned::folder("scan-skipped-rar", comics.path()).await;

    assert_eq!(
        (scan.unsupported_books, scan.skipped_types),
        (
            1,
            vec![SkippedType {
                file_type: FileType::try_from("rar".to_owned()).unwrap(),
                files: 1,
                first_locations: vec![location_in_series("v02.rar")],
            }]
        )
    );
}

#[tokio::test]
async fn counts_a_file_of_a_type_it_reads_holding_an_archive_it_cannot_as_unreadable() {
    let comics = ScratchFolder::new("scan-skipped-cbz");
    comics.write("Sample Series 01/v01.cbz", RAR_SIGNATURE);
    comics.write("Sample Series 01/v02.cb7", RAR_SIGNATURE);

    let (_, scan, _) = Scanned::folder("scan-skipped-cbz", comics.path()).await;

    assert_eq!(
        (
            scan.unreadable_books,
            scan.unsupported_books,
            scan.skipped_types
        ),
        (2, 0, Vec::new())
    );
}

#[tokio::test]
async fn counts_as_unsupported_exactly_the_files_it_lists_as_skipped() {
    let comics = ScratchFolder::new("scan-skipped-all-listed");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    for name in ["v02.cbr", "v03.rar", "v04.cbz", "v05.cb7"] {
        comics.write(&format!("Sample Series 01/{name}"), RAR_SIGNATURE);
    }
    comics.write("Sample Series 01/v06.cbr", b"");

    let (_, scan, _) = Scanned::folder("scan-skipped-all-listed", comics.path()).await;

    let listed: u32 = scan.skipped_types.iter().map(|skipped| skipped.files).sum();
    assert_eq!(scan.unsupported_books, listed);
}

#[tokio::test]
async fn counts_a_damaged_file_of_a_type_it_does_not_read_as_unreadable_without_listing_it() {
    let comics = ScratchFolder::new("scan-skipped-damaged");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    comics.write("Sample Series 01/v02.cbr", b"");

    let (_, scan, _) = Scanned::folder("scan-skipped-damaged", comics.path()).await;

    assert_eq!(
        (
            scan.unreadable_books,
            scan.unsupported_books,
            scan.skipped_types
        ),
        (1, 0, Vec::new())
    );
}

#[tokio::test]
async fn lists_only_the_first_files_of_a_type_it_skips_with_how_many_it_skipped() {
    let comics = ScratchFolder::new("scan-skipped-many");
    let names: Vec<String> = (1..=25).map(|volume| format!("v{volume:02}.cbr")).collect();
    for name in &names {
        comics.write(&format!("Sample Series 01/{name}"), RAR_SIGNATURE);
    }

    let (_, scan, _) = Scanned::folder("scan-skipped-many", comics.path()).await;

    assert_eq!(
        scan.skipped_types,
        [SkippedType {
            file_type: cbr(),
            files: 25,
            first_locations: names[..LOCATIONS_LISTED_PER_TYPE]
                .iter()
                .map(|name| location_in_series(name))
                .collect(),
        }]
    );
}

#[tokio::test]
async fn scans_a_cb7_as_a_book_of_its_series() {
    let comics = ScratchFolder::new("scan-cb7");
    write_book(&comics.path().join("Sample Series 01/v01.cbz"), 1);
    let pages = [ArchiveEntry {
        name: "001.png".to_owned(),
        bytes: page_png(2, 0, PageShape::Portrait).unwrap(),
    }];
    comics.write(
        "Sample Series 01/v02.cb7",
        &cb7(&pages, Packing::Solid).unwrap(),
    );

    let (scanned, scan, _) = Scanned::folder("scan-cb7", comics.path()).await;

    assert_eq!(scanned.books_in("Sample Series 01"), ["v01", "v02"]);
    assert_eq!((scan.books, scan.unreadable_books), (2, 0));
}

#[tokio::test]
async fn titles_and_orders_books_by_file_name_whatever_their_comic_info_titles() {
    let comics = ScratchFolder::new("scan-titles");
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
async fn keeps_the_details_each_book_s_comic_info_gives() {
    let comics = ScratchFolder::new("scan-details");
    write_book_with(
        &comics.path().join("Sample Series 01/v01.cbz"),
        1,
        Some(FULL_COMIC_INFO),
    );

    let (scanned, _, _) = Scanned::folder("scan-details", comics.path()).await;

    let text = |value: &str| Value::Text(value.to_owned());
    assert_eq!(
        stored_details(&scanned.connection()),
        [vec![
            text("Sample Series 01"),
            text("1"),
            text("Sample Story"),
            Value::Integer(2),
            text("A sample summary."),
            text("Sample Publisher"),
            text("Digital"),
            text("en"),
            text("right_to_left"),
            text("adults_only_18"),
            Value::Integer(2019),
        ]]
    );
}

#[tokio::test]
async fn keeps_the_people_and_tags_each_book_s_comic_info_names() {
    let comics = ScratchFolder::new("scan-people-and-tags");
    write_book_with(
        &comics.path().join("Sample Series 01/v01.cbz"),
        1,
        Some(FULL_COMIC_INFO),
    );

    let (scanned, _, _) = Scanned::folder("scan-people-and-tags", comics.path()).await;

    assert_eq!(
        stored_names(
            &scanned,
            "SELECT role, name FROM book_person ORDER BY role, name"
        ),
        owned_pairs(&[
            ("colourist", "Sample Colourist"),
            ("cover_artist", "Sample Cover Artist"),
            ("editor", "Sample Editor"),
            ("inker", "Sample Artist"),
            ("letterer", "Sample Letterer"),
            ("penciller", "Sample Artist"),
            ("penciller", "Second Artist"),
            ("writer", "Sample Author"),
        ])
    );
    assert_eq!(
        stored_names(
            &scanned,
            "SELECT kind, name FROM book_tag ORDER BY kind, name"
        ),
        owned_pairs(&[
            ("genre", "Adventure"),
            ("genre", "Mystery"),
            ("tag", "harbour")
        ])
    );
}

#[tokio::test]
async fn scans_a_book_whose_comic_info_cannot_be_read_with_no_details() {
    let comics = ScratchFolder::new("scan-broken-details");
    write_book_with(
        &comics.path().join("Sample Series 01/v01.cbz"),
        1,
        Some("<ComicInfo><Series>Sample Series 01</Title></ComicInfo>"),
    );

    let (scanned, scan, _) = Scanned::folder("scan-broken-details", comics.path()).await;

    assert_eq!((scan.books, scan.unreadable_books), (1, 0));
    assert_eq!(
        stored_details(&scanned.connection()),
        [vec![Value::Null; 11]]
    );
}

#[tokio::test]
async fn titles_a_folder_of_images_by_its_whole_name_dots_included() {
    let comics = ScratchFolder::new("scan-dotted-chapters");
    for (chapter, seed) in [("Ch 10.5", 1), ("Ch 10.6", 2)] {
        write_page(&comics.path().join("Sample Series 01").join(chapter), seed);
    }

    let (scanned, _, _) = Scanned::folder("scan-dotted-chapters", comics.path()).await;

    assert_eq!(scanned.books_in("Sample Series 01"), ["Ch 10.5", "Ch 10.6"]);
}

#[tokio::test]
async fn leaves_out_a_cover_image_beside_the_books_of_a_series() {
    let comics = ScratchFolder::new("scan-series-cover");
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
    let comics = ScratchFolder::new("scan-duplicate-book");
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
    let target = ScratchFolder::new("scan-link-target");
    write_book(&target.path().join("Sample Series 01/v01.cbz"), 1);
    let comics = ScratchFolder::new("scan-with-link");
    std::os::unix::fs::symlink(target.path(), comics.path().join("Linked")).unwrap();

    let (_, scan, _) = Scanned::folder("scan-with-link", comics.path()).await;

    assert_eq!(scan.books, 0);
}

#[cfg(unix)]
#[tokio::test]
async fn counts_the_folders_it_cannot_read_and_carries_on() {
    use std::os::unix::fs::PermissionsExt;
    let comics = ScratchFolder::new("scan-locked");
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
        ScanProgress::Adding {
            name: "Comics".to_owned(),
            location: "/media/usb/Comics".to_owned(),
        },
        ScanProgress::Finding { found: 4 },
        ScanProgress::Reading {
            scanned: 3,
            total: 7,
        },
    ];

    let sent = stages.map(|stage| serde_json::to_value(stage).unwrap());

    assert_eq!(
        sent,
        [
            serde_json::json!({ "stage": "adding", "name": "Comics", "location": "/media/usb/Comics" }),
            serde_json::json!({ "stage": "finding", "found": 4 }),
            serde_json::json!({ "stage": "reading", "scanned": 3, "total": 7 }),
        ]
    );
}
