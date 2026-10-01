#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

use std::{env, fs, path::PathBuf, process};

use omnileaf_formats::{ComicInfoError, PageKind, ReadingDirection, open_book, parse_comic_info};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_png};

const FULL: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Series>Sample Series 04</Series>
  <Number>12.5</Number>
  <Title>The Harbour Gate</Title>
  <Volume>3</Volume>
  <Summary>A storm &amp; a gate, caf&#233; included.</Summary>
  <Writer>Sample Author, Second Author</Writer>
  <Penciller>Sample Artist</Penciller>
  <Publisher>Sample Publisher</Publisher>
  <Genre>Mystery, Adventure</Genre>
  <Tags>harbour, storms</Tags>
  <LanguageISO>en</LanguageISO>
  <Manga>YesAndRightToLeft</Manga>
  <PageCount>3</PageCount>
  <AgeRating>Everyone</AgeRating>
  <Pages>
    <Page Image="0" Type="FrontCover" ImageWidth="400" ImageHeight="600" />
    <Page Image="1" DoublePage="True" />
    <Page Image="2" Type="Story"></Page>
  </Pages>
</ComicInfo>"#;

#[test]
fn reads_the_details_of_a_full_comic_info() {
    let info = parse_comic_info(FULL.as_bytes()).unwrap();

    assert_eq!(info.series.as_deref(), Some("Sample Series 04"));
    assert_eq!(info.number.as_deref(), Some("12.5"));
    assert_eq!(info.title.as_deref(), Some("The Harbour Gate"));
    assert_eq!(info.volume, Some(3));
    assert_eq!(
        info.summary.as_deref(),
        Some("A storm & a gate, café included.")
    );
    assert_eq!(info.writers, ["Sample Author", "Second Author"]);
    assert_eq!(info.pencillers, ["Sample Artist"]);
    assert_eq!(info.publisher.as_deref(), Some("Sample Publisher"));
    assert_eq!(info.genres, ["Mystery", "Adventure"]);
    assert_eq!(info.tags, ["harbour", "storms"]);
    assert_eq!(info.language.as_deref(), Some("en"));
    assert_eq!(info.reading_direction, Some(ReadingDirection::RightToLeft));
    assert_eq!(info.page_count, Some(3));
    assert_eq!(
        info.other.get("AgeRating").map(String::as_str),
        Some("Everyone")
    );
}

#[test]
fn reads_each_pages_details() {
    let info = parse_comic_info(FULL.as_bytes()).unwrap();

    let pages = &info.pages;

    assert_eq!(pages.len(), 3);
    assert_eq!(pages[0].image, 0);
    assert_eq!(pages[0].kind, Some(PageKind::FrontCover));
    assert_eq!((pages[0].width, pages[0].height), (Some(400), Some(600)));
    assert!(pages[1].double_page);
    assert_eq!(pages[2].kind, Some(PageKind::Story));
}

#[test]
fn reads_the_reading_direction_from_the_manga_field() {
    for (value, direction) in [
        ("YesAndRightToLeft", Some(ReadingDirection::RightToLeft)),
        ("Yes", Some(ReadingDirection::RightToLeft)),
        ("No", Some(ReadingDirection::LeftToRight)),
        ("Unknown", None),
    ] {
        let xml = format!("<ComicInfo><Manga>{value}</Manga></ComicInfo>");

        let info = parse_comic_info(xml.as_bytes()).unwrap();

        assert_eq!(info.reading_direction, direction, "{value}");
    }
}

#[test]
fn leaves_out_fields_that_are_missing_or_blank() {
    let info = parse_comic_info(
        b"<ComicInfo><Series>  </Series><Volume>not a number</Volume></ComicInfo>",
    )
    .unwrap();

    assert_eq!(info.series, None);
    assert_eq!(info.volume, None);
    assert!(info.writers.is_empty());
}

#[test]
fn refuses_a_document_type_declaration() {
    let xml = br#"<?xml version="1.0"?><!DOCTYPE ComicInfo [<!ENTITY x SYSTEM "file:///etc/passwd">]><ComicInfo><Series>&x;</Series></ComicInfo>"#;

    let error = parse_comic_info(xml).unwrap_err();

    assert!(matches!(error, ComicInfoError::DocumentType), "{error:?}");
}

#[test]
fn refuses_an_unknown_entity() {
    let error = parse_comic_info(b"<ComicInfo><Series>&custom;</Series></ComicInfo>").unwrap_err();

    assert!(
        matches!(error, ComicInfoError::UnknownEntity { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_document_that_is_not_comic_info() {
    let error = parse_comic_info(b"<Book><Series>Sample</Series></Book>").unwrap_err();

    assert!(matches!(error, ComicInfoError::NotComicInfo), "{error:?}");
}

#[test]
fn reports_malformed_xml() {
    let error = parse_comic_info(b"<ComicInfo><Series>Sample</Title></ComicInfo>").unwrap_err();

    assert!(
        matches!(error, ComicInfoError::Malformed { .. }),
        "{error:?}"
    );
}

struct ScratchFolder(PathBuf);

impl ScratchFolder {
    fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-comic-info-{}", process::id()))
            .join(name);
        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn entry(name: &str, bytes: Vec<u8>) -> ArchiveEntry {
    ArchiveEntry {
        name: name.to_owned(),
        bytes,
    }
}

#[test]
fn reads_comic_info_from_an_archive_and_a_folder() {
    let scratch = ScratchFolder::new("both");
    let page = page_png(5, 0, PageShape::Portrait).unwrap();
    let archive = cbz(
        &[
            entry("ComicInfo.xml", FULL.as_bytes().to_vec()),
            entry("1.png", page.clone()),
        ],
        Compression::Deflated,
    )
    .unwrap();
    let archive_path = scratch.0.join("book.cbz");
    fs::write(&archive_path, archive).unwrap();
    let folder = scratch.0.join("Chapter 01");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("1.png"), page).unwrap();
    fs::write(folder.join("ComicInfo.xml"), FULL).unwrap();

    for path in [archive_path, folder] {
        let info = open_book(&path).unwrap().comic_info().unwrap().unwrap();

        assert_eq!(
            info.series.as_deref(),
            Some("Sample Series 04"),
            "{}",
            path.display()
        );
    }
}

#[test]
fn has_no_comic_info_when_the_book_carries_none() {
    let scratch = ScratchFolder::new("none");
    let page = page_png(5, 0, PageShape::Portrait).unwrap();
    let path = scratch.0.join("book.cbz");
    fs::write(
        &path,
        cbz(&[entry("1.png", page)], Compression::Stored).unwrap(),
    )
    .unwrap();

    let info = open_book(&path).unwrap().comic_info().unwrap();

    assert!(info.is_none());
}
