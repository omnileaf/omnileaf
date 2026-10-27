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
    reason = "these tests read how each book is numbered, never how the series list it"
)]
mod scanned;
mod support;

use books::write_book_with;
use scanned::Scanned;
use support::ScratchFolder;

const SERIES_FOLDER: &str = "Sample Series 04";
const STORED_NUMBERING: &str = "SELECT title, concat_ws(' ', kind, first_number, last_number,
    number_source, volume_number, volume_source) FROM book ORDER BY title";

async fn numbered(name: &str, books: &[(&str, &str)]) -> Vec<(String, String)> {
    let comics = ScratchFolder::new(name);
    for ((book, comic_info), seed) in books.iter().zip(1..) {
        let path = comics.path().join(SERIES_FOLDER).join(book);
        write_book_with(&path, seed, Some(comic_info));
    }
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    scanned
        .connection()
        .prepare(STORED_NUMBERING)
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn owned_pairs(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(title, numbering)| ((*title).to_owned(), (*numbering).to_owned()))
        .collect()
}

#[tokio::test]
async fn numbers_a_volume_by_its_comic_info_volume_and_ignores_its_comic_info_number() {
    let books = [(
        "Sample Series 04 v02.cbz",
        "<ComicInfo><Number>2</Number><Volume>3</Volume></ComicInfo>",
    )];

    let numbered = numbered("comic-info-volume", &books).await;

    assert_eq!(
        numbered,
        owned_pairs(&[("Sample Series 04 v02", "volume 3000 3000 files")])
    );
}

#[tokio::test]
async fn numbers_a_chapter_by_its_comic_info_number_and_volume() {
    let books = [
        (
            "Sample Series 04 c005.cbz",
            "<ComicInfo><Number>5.5</Number><Volume>2</Volume></ComicInfo>",
        ),
        (
            "Volume 01/Sample Series 04 c007.cbz",
            "<ComicInfo><Number>8-9</Number></ComicInfo>",
        ),
    ];

    let numbered = numbered("comic-info-chapter", &books).await;

    assert_eq!(
        numbered,
        owned_pairs(&[
            (
                "Sample Series 04 c005",
                "chapter 5500 5500 files 2000 files"
            ),
            (
                "Sample Series 04 c007",
                "chapter 8000 9000 files 1000 folder_name"
            ),
        ])
    );
}

#[tokio::test]
async fn numbers_a_book_its_name_leaves_unnumbered_by_its_comic_info() {
    let books = [
        (
            "Sample Series 04 Art Book.cbz",
            "<ComicInfo><Number>12</Number><Volume>2</Volume></ComicInfo>",
        ),
        (
            "Sample Series 04 Extras.cbz",
            "<ComicInfo><Volume>4</Volume></ComicInfo>",
        ),
        (
            "Sample Series 04 Omake.cbz",
            "<ComicInfo><Writer>Sample Author</Writer></ComicInfo>",
        ),
    ];

    let numbered = numbered("comic-info-unnumbered", &books).await;

    assert_eq!(
        numbered,
        owned_pairs(&[
            (
                "Sample Series 04 Art Book",
                "chapter 12000 12000 files 2000 files"
            ),
            ("Sample Series 04 Extras", "volume 4000 4000 files"),
            ("Sample Series 04 Omake", "special"),
        ])
    );
}

#[tokio::test]
async fn keeps_a_book_in_a_specials_folder_special_whatever_its_comic_info_numbers() {
    let books = [(
        "Specials/Sample Series 04 Bonus.cbz",
        "<ComicInfo><Number>7</Number><Volume>1</Volume></ComicInfo>",
    )];

    let numbered = numbered("comic-info-specials", &books).await;

    assert_eq!(
        numbered,
        owned_pairs(&[("Sample Series 04 Bonus", "special")])
    );
}
