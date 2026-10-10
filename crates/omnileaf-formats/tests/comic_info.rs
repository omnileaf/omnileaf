mod support;

use omnileaf_formats::{
    ComicInfoError, FormatError, PageKind, ReadingDirection, open_book, parse_comic_info,
};
use omnileaf_testkit::{Compression, PageShape, cbz, page_png};
use support::{ScratchFolder, entry};

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
    let archive_path = scratch.write("book.cbz", &archive);
    scratch.write("Chapter 01/1.png", &page);
    scratch.write("Chapter 01/ComicInfo.xml", FULL.as_bytes());
    let folder = scratch.path().join("Chapter 01");

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
    let path = scratch.write(
        "book.cbz",
        &cbz(&[entry("1.png", page)], Compression::Stored).unwrap(),
    );

    let info = open_book(&path).unwrap().comic_info().unwrap();

    assert!(info.is_none());
}

#[test]
fn reads_a_folders_comic_info_whatever_the_case_of_its_name() {
    let scratch = ScratchFolder::new("folder-case");
    scratch.write(
        "Chapter 01/1.png",
        &page_png(5, 0, PageShape::Portrait).unwrap(),
    );
    scratch.write("Chapter 01/comicinfo.XML", FULL.as_bytes());

    let info = open_book(&scratch.path().join("Chapter 01"))
        .unwrap()
        .comic_info()
        .unwrap()
        .unwrap();

    assert_eq!(info.series.as_deref(), Some("Sample Series 04"));
}

#[test]
fn refuses_a_folders_comic_info_larger_than_the_limit() {
    let scratch = ScratchFolder::new("folder-large");
    scratch.write(
        "Chapter 01/1.png",
        &page_png(5, 0, PageShape::Portrait).unwrap(),
    );
    scratch.write("Chapter 01/ComicInfo.xml", &vec![b' '; 1024 * 1024 + 1]);
    let mut book = open_book(&scratch.path().join("Chapter 01")).unwrap();

    let error = book.comic_info().unwrap_err();

    assert!(
        matches!(error, FormatError::ComicInfoTooLarge { .. }),
        "{error:?}"
    );
}
