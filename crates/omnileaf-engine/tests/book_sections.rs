#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write plain archives, so the other kinds of book go unused"
)]
mod books;
#[expect(
    dead_code,
    reason = "these tests read what the library serves, never the stored rows"
)]
mod scanned;
mod support;

use books::write_book;
use omnileaf_engine::{
    BookNumber, BookSection, LibraryListing, SeriesBook, SeriesBookListing, SeriesId,
};
use scanned::Scanned;
use serde_json::{Value, json};
use support::ScratchFolder;

const SERIES_04: &str = "Sample Series 04";
const SERVED_FIELDS: [&str; 5] = ["title", "kind", "numbers", "volume", "section"];
const SERIES_04_BOOKS: &[&str] = &[
    "Sample Series 04 (2019)/Volume 01/Sample Series 04 c001.cbz",
    "Sample Series 04 (2019)/Volume 01/Sample Series 04 c002.5.cbz",
    "Sample Series 04 (2019)/Sample Series 04 v03.cbz",
    "Sample Series 04 (2019)/Sample Series 04 v05-06.cbz",
    "Sample Series 04 (2019)/Sample Series 04 v09.5.cbz",
    "Sample Series 04 (2019)/Sample Series 04 c020-022.cbz",
    "Sample Series 04 (2019)/Specials/Sample Series 04 Extras.cbz",
];

struct Sample {
    scanned: Scanned,
    series: SeriesId,
    _comics: ScratchFolder,
}

impl Sample {
    async fn scan(name: &str, books: &[&str]) -> Self {
        let comics = ScratchFolder::new(name);
        for (book, seed) in books.iter().zip(1..) {
            write_book(&comics.path().join(book), seed);
        }
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        let page = scanned
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        let series = page
            .series
            .into_iter()
            .find(|series| series.title == SERIES_04)
            .unwrap()
            .id;
        Self {
            scanned,
            series,
            _comics: comics,
        }
    }

    async fn listed(&self, section: Option<BookSection>) -> Vec<SeriesBook> {
        let listing = SeriesBookListing {
            section,
            ..SeriesBookListing::default()
        };
        self.scanned
            .library
            .series_books(self.series, listing, None)
            .await
            .unwrap()
            .books
    }
}

fn served_numbers(books: &[SeriesBook]) -> Vec<Value> {
    books
        .iter()
        .map(|book| {
            let served = serde_json::to_value(book).unwrap();
            Value::Array(
                SERVED_FIELDS
                    .map(|field| served.get(field).cloned().unwrap())
                    .into(),
            )
        })
        .collect()
}

#[tokio::test]
async fn serves_each_book_with_its_kind_numbers_volume_and_section() {
    let sample = Sample::scan("served-book-numbers", SERIES_04_BOOKS).await;

    let books = sample.listed(None).await;

    assert_eq!(
        served_numbers(&books),
        [
            json!(["Sample Series 04 c001", "chapter", {"first": 1.0, "last": 1.0}, 1.0, "volumes"]),
            json!(["Sample Series 04 c002.5", "chapter", {"first": 2.5, "last": 2.5}, 1.0, "volumes"]),
            json!(["Sample Series 04 v03", "volume", {"first": 3.0, "last": 3.0}, null, "volumes"]),
            json!(["Sample Series 04 v05-06", "volume", {"first": 5.0, "last": 6.0}, null, "volumes"]),
            json!(["Sample Series 04 v09.5", "volume", {"first": 9.5, "last": 9.5}, null, "volumes"]),
            json!(["Sample Series 04 c020-022", "chapter", {"first": 20.0, "last": 22.0}, null, "chapters"]),
            json!(["Sample Series 04 Extras", "special", null, null, "specials"]),
        ]
    );
}

#[tokio::test]
async fn lists_only_the_books_of_the_section_asked_for() {
    let sample = Sample::scan("listed-book-section", SERIES_04_BOOKS).await;

    let chapters = sample.listed(Some(BookSection::Chapters)).await;

    assert_eq!(
        chapters
            .iter()
            .map(|book| (book.title.as_str(), book.position))
            .collect::<Vec<_>>(),
        [("Sample Series 04 c020-022", 6)]
    );
}

#[tokio::test]
async fn sums_up_a_series_by_its_year_section_counts_missing_volumes_and_last_volume() {
    let sample = Sample::scan("overview-book-sections", SERIES_04_BOOKS).await;

    let overview = sample
        .scanned
        .library
        .series_overview(sample.series)
        .await
        .unwrap();

    let served = serde_json::to_value(overview).unwrap();
    assert_eq!(
        ["year", "sections", "missingVolumes", "lastVolume"]
            .map(|field| served.get(field).cloned().unwrap()),
        [
            json!(2019),
            json!([
                {"section": "volumes", "bookCount": 5},
                {"section": "chapters", "bookCount": 1},
                {"section": "specials", "bookCount": 1},
            ]),
            json!([
                {"first": 2.0, "last": 2.0},
                {"first": 4.0, "last": 4.0},
                {"first": 7.0, "last": 9.0},
            ]),
            json!(9.5),
        ]
    );
}

fn volume(number: f64) -> BookNumber {
    BookNumber::try_from(number).unwrap()
}

#[tokio::test]
async fn lists_only_the_chapters_filed_in_a_volume_with_their_place_in_the_series() {
    let sample = Sample::scan("listed-volume-chapters", SERIES_04_BOOKS).await;
    let listing = SeriesBookListing {
        volume: Some(volume(1.0)),
        ..SeriesBookListing::default()
    };

    let chapters = sample
        .scanned
        .library
        .series_books(sample.series, listing, None)
        .await
        .unwrap()
        .books;

    assert_eq!(
        chapters
            .iter()
            .map(|book| (book.title.as_str(), book.position))
            .collect::<Vec<_>>(),
        [("Sample Series 04 c001", 1), ("Sample Series 04 c002.5", 2)]
    );
}

#[tokio::test]
async fn sums_up_a_volume_by_its_chapters_cover_and_folder() {
    let sample = Sample::scan("volume-overview-served", SERIES_04_BOOKS).await;

    let found = sample
        .scanned
        .library
        .series_volume(sample.series, volume(1.0))
        .await
        .unwrap()
        .unwrap();

    let served = serde_json::to_value(found).unwrap();
    assert_eq!(
        ["volume", "folder", "bookCount", "readCount"]
            .map(|field| served.get(field).cloned().unwrap()),
        [json!(1.0), json!("Volume 01"), json!(2), json!(0)]
    );
    assert!(served.get("cover").is_some_and(|cover| !cover.is_null()));
}

#[tokio::test]
async fn names_no_folder_for_a_volume_whose_chapters_take_it_from_their_file_names() {
    let sample = Sample::scan(
        "volume-from-file-names",
        &["Sample Series 04 (2019)/Sample Series 04 v02 c005.cbz"],
    )
    .await;

    let found = sample
        .scanned
        .library
        .series_volume(sample.series, volume(2.0))
        .await
        .unwrap()
        .unwrap();

    assert_eq!((found.book_count, found.folder), (1, None));
}

#[tokio::test]
async fn finds_no_volume_where_no_chapter_is_filed_in_one() {
    let sample = Sample::scan("volume-absent", SERIES_04_BOOKS).await;

    let found = [volume(3.0), volume(42.0)]
        .map(|number| sample.scanned.library.series_volume(sample.series, number));
    let mut none = Vec::new();
    for lookup in found {
        none.push(lookup.await.unwrap().is_none());
    }

    assert_eq!(none, [true, true]);
}

#[test]
fn reads_a_book_number_from_its_decimal_value_and_refuses_one_that_cannot_be_held() {
    let numbers: Vec<Option<BookNumber>> = [12.5, 0.0, -1.0, f64::NAN, 5_000_000.0]
        .map(|number| BookNumber::try_from(number).ok())
        .into();

    assert_eq!(
        numbers.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, true, false, false, false]
    );
}
