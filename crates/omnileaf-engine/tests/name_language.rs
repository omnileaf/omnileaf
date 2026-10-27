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
use scanned::Scanned;
use support::ScratchFolder;

const NO_LANGUAGE: &str = "<ComicInfo><Writer>Sample Author</Writer></ComicInfo>";
const IN_JAPANESE: &str = "<ComicInfo><LanguageISO>ja</LanguageISO></ComicInfo>";

async fn series_languages(name: &str, books: &[(&str, &str)]) -> Vec<Vec<Value>> {
    let comics = ScratchFolder::new(name);
    for ((book, comic_info), seed) in books.iter().zip(1..) {
        write_book_with(&comics.path().join(book), seed, Some(comic_info));
    }
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    languages(&scanned)
}

fn languages(scanned: &Scanned) -> Vec<Vec<Value>> {
    scanned
        .connection()
        .prepare(
            "SELECT title, language, language_source FROM series
            WHERE local_id IN (SELECT series_local_id FROM book) ORDER BY title",
        )
        .unwrap()
        .query_map([], |row| (0..3).map(|column| row.get(column)).collect())
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

#[tokio::test]
async fn names_a_series_in_the_language_tagged_in_a_book_name_when_comic_info_gives_none() {
    let books = [
        ("Sample Series 04/Sample Series 04 v01.cbz", NO_LANGUAGE),
        (
            "Sample Series 04/[GroupName] Sample Series 04 v02 [pt-br].cbz",
            NO_LANGUAGE,
        ),
    ];

    let languages = series_languages("name-language-tag", &books).await;

    assert_eq!(
        languages,
        [vec![
            text("Sample Series 04"),
            text("pt-BR"),
            text("file_name")
        ]]
    );
}

#[tokio::test]
async fn names_a_series_in_the_comic_info_language_over_the_one_tagged_in_a_book_name() {
    let books = [(
        "Sample Series 04/Sample Series 04 v01 [EN].cbz",
        IN_JAPANESE,
    )];

    let languages = series_languages("name-language-comic-info", &books).await;

    assert_eq!(
        languages,
        [vec![text("Sample Series 04"), text("ja"), text("files")]]
    );
}
