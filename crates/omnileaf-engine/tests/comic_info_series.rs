#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with ComicInfo, so the other kinds of book go unused"
)]
mod books;
#[expect(
    dead_code,
    reason = "these tests read the series a scan files books in, never the folder it scanned"
)]
mod scanned;
mod support;

use books::write_book_with;
use omnileaf_db::rusqlite::types::Value;
use scanned::{Scanned, owned};
use support::ScratchFolder;

const NO_SERIES: &str = "<ComicInfo><Writer>Sample Author</Writer></ComicInfo>";

async fn scanned(name: &str, books: &[(&str, &str)]) -> Scanned {
    let comics = ScratchFolder::new(name);
    for ((book, comic_info), seed) in books.iter().zip(1..) {
        write_book_with(&comics.path().join(book), seed, Some(comic_info));
    }
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    scanned
}

fn named_series(scanned: &Scanned) -> Vec<Vec<Value>> {
    scanned
        .connection()
        .prepare(
            "SELECT title, title_source, year, year_source FROM series
            WHERE local_id IN (SELECT series_local_id FROM book) ORDER BY title",
        )
        .unwrap()
        .query_map([], |row| (0..4).map(|column| row.get(column)).collect())
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

#[tokio::test]
async fn dates_a_series_by_the_earliest_comic_info_year_of_its_books_over_its_folder_year() {
    let books = [
        (
            "Sample Series 04 (2015)/v01.cbz",
            "<ComicInfo><Year>2021</Year></ComicInfo>",
        ),
        (
            "Sample Series 04 (2015)/v02.cbz",
            "<ComicInfo><Year>2019</Year></ComicInfo>",
        ),
        ("Sample Series 04 (2015)/v03.cbz", NO_SERIES),
    ];

    let scanned = scanned("comic-info-year", &books).await;

    assert_eq!(
        named_series(&scanned),
        [vec![
            text("Sample Series 04"),
            text("folder_name"),
            Value::Integer(2019),
            text("files")
        ]]
    );
    assert_eq!(scanned.series(), owned(&[("Sample Series 04", 3)]));
}

#[tokio::test]
async fn joins_the_folders_whose_books_name_the_same_series_under_that_name() {
    let books = [
        (
            "Author A/Sample Series 02/v01.cbz",
            "<ComicInfo><Series>Sample Series 07</Series></ComicInfo>",
        ),
        (
            "Author B/Sample Series 02/v02.cbz",
            "<ComicInfo><Series>sample series 07</Series></ComicInfo>",
        ),
    ];

    let scanned = scanned("comic-info-joined-folders", &books).await;

    assert_eq!(
        named_series(&scanned),
        [vec![
            text("Sample Series 07"),
            text("files"),
            Value::Null,
            Value::Null
        ]]
    );
    assert_eq!(scanned.series(), owned(&[("Sample Series 07", 2)]));
}

#[tokio::test]
async fn keeps_a_folder_where_only_some_books_name_a_series_one_series() {
    let books = [
        ("Sample Series 02/v01.cbz", NO_SERIES),
        (
            "Sample Series 02/v02.cbz",
            "<ComicInfo><Series>Sample Series 07</Series></ComicInfo>",
        ),
        ("Sample Series 02/v03.cbz", NO_SERIES),
    ];

    let scanned = scanned("comic-info-mixed-folder", &books).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 07", 3)]));
}

#[tokio::test]
async fn keeps_a_folder_in_the_series_its_books_named_first() {
    let books = [
        (
            "Sample Series 02/v01.cbz",
            "<ComicInfo><Series>Sample Series 07</Series></ComicInfo>",
        ),
        (
            "Sample Series 02/v02.cbz",
            "<ComicInfo><Series>Sample Series 08</Series></ComicInfo>",
        ),
    ];

    let scanned = scanned("comic-info-first-naming", &books).await;

    assert_eq!(scanned.series(), owned(&[("Sample Series 07", 2)]));
}

#[tokio::test]
async fn dates_a_joined_series_by_the_earliest_year_of_the_books_in_its_folders() {
    let books = [
        (
            "Sample Series 02 (2015)/v01.cbz",
            "<ComicInfo><Year>2018</Year></ComicInfo>",
        ),
        (
            "Sample Series 02 (2015)/v02.cbz",
            "<ComicInfo><Series>Sample Series 07</Series><Year>2020</Year></ComicInfo>",
        ),
    ];

    let scanned = scanned("comic-info-joined-year", &books).await;

    assert_eq!(
        named_series(&scanned),
        [vec![
            text("Sample Series 07"),
            text("files"),
            Value::Integer(2018),
            text("files")
        ]]
    );
}
