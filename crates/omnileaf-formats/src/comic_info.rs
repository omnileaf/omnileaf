use std::collections::BTreeMap;

use quick_xml::{
    Reader, XmlVersion,
    escape::resolve_xml_entity,
    events::{BytesRef, BytesStart, Event},
};

const ROOT: &str = "ComicInfo";
const PAGES: &str = "Pages";
const PAGE: &str = "Page";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadingDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PageKind {
    FrontCover,
    InnerCover,
    Roundup,
    Story,
    Advertisement,
    Editorial,
    Letters,
    Preview,
    BackCover,
    Other,
    Deleted,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PageInfo {
    pub image: u32,
    pub kind: Option<PageKind>,
    pub double_page: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ComicInfo {
    pub series: Option<String>,
    pub number: Option<String>,
    pub title: Option<String>,
    pub volume: Option<u32>,
    pub summary: Option<String>,
    pub writers: Vec<String>,
    pub pencillers: Vec<String>,
    pub inkers: Vec<String>,
    pub colourists: Vec<String>,
    pub letterers: Vec<String>,
    pub cover_artists: Vec<String>,
    pub editors: Vec<String>,
    pub publisher: Option<String>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub language: Option<String>,
    pub reading_direction: Option<ReadingDirection>,
    pub page_count: Option<u32>,
    pub pages: Vec<PageInfo>,
    pub other: BTreeMap<String, String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ComicInfoError {
    #[error("ComicInfo isn't well-formed XML: {reason}")]
    Malformed { reason: String },
    #[error("ComicInfo declares a document type, which isn't allowed")]
    DocumentType,
    #[error("ComicInfo uses the unknown entity &{name};")]
    UnknownEntity { name: String },
    #[error("the document isn't a ComicInfo")]
    NotComicInfo,
}

/// Reads a ComicInfo.xml document, refusing document type declarations so no external entity is ever read.
pub fn parse_comic_info(xml: &[u8]) -> Result<ComicInfo, ComicInfoError> {
    let mut reader = Reader::from_reader(xml);
    let mut info = ComicInfo::default();
    let mut open: Vec<String> = Vec::new();
    let mut text = String::new();
    let mut found_root = false;
    loop {
        match reader.read_event().map_err(malformed)? {
            Event::DocType(_) => return Err(ComicInfoError::DocumentType),
            Event::Start(element) => {
                found_root |= enter(&element, &open, &mut info)?;
                open.push(element.local_name().as_ref().to_owned());
                text.clear();
            }
            Event::Empty(element) => {
                found_root |= enter(&element, &open, &mut info)?;
            }
            Event::Text(chunk) => text.push_str(&chunk.xml_content(XmlVersion::Implicit1_0)),
            Event::CData(chunk) => text.push_str(&chunk.xml_content(XmlVersion::Implicit1_0)),
            Event::GeneralRef(reference) => text.push_str(&resolve(&reference)?),
            Event::End(_) => {
                if let [root, field] = open.as_slice()
                    && root == ROOT
                {
                    set_field(&mut info, field, text.trim());
                }
                open.pop();
                text.clear();
            }
            Event::Eof => break,
            Event::Comment(_) | Event::Decl(_) | Event::PI(_) => {}
        }
    }
    if found_root {
        Ok(info)
    } else {
        Err(ComicInfoError::NotComicInfo)
    }
}

fn enter(
    element: &BytesStart<'_>,
    open: &[String],
    info: &mut ComicInfo,
) -> Result<bool, ComicInfoError> {
    let name = element.local_name();
    match open {
        [] if name.as_ref() == ROOT => Ok(true),
        [] => Err(ComicInfoError::NotComicInfo),
        [root, pages] if root == ROOT && pages == PAGES && name.as_ref() == PAGE => {
            info.pages.push(page_info(element)?);
            Ok(false)
        }
        _ => Ok(false),
    }
}

fn resolve(reference: &BytesRef<'_>) -> Result<String, ComicInfoError> {
    if reference.is_char_ref() {
        return reference
            .resolve_char_ref()
            .map_err(malformed)?
            .map(String::from)
            .ok_or_else(|| ComicInfoError::Malformed {
                reason: "an empty character reference".to_owned(),
            });
    }
    let name = reference.to_string();
    resolve_xml_entity(&name)
        .map(ToOwned::to_owned)
        .ok_or(ComicInfoError::UnknownEntity { name })
}

fn set_field(info: &mut ComicInfo, field: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    let text = || Some(value.to_owned());
    match field {
        "Series" => info.series = text(),
        "Number" => info.number = text(),
        "Title" => info.title = text(),
        "Volume" => info.volume = value.parse().ok(),
        "Summary" => info.summary = text(),
        "Writer" => info.writers = list(value),
        "Penciller" => info.pencillers = list(value),
        "Inker" => info.inkers = list(value),
        "Colorist" => info.colourists = list(value),
        "Letterer" => info.letterers = list(value),
        "CoverArtist" => info.cover_artists = list(value),
        "Editor" => info.editors = list(value),
        "Publisher" => info.publisher = text(),
        "Genre" => info.genres = list(value),
        "Tags" => info.tags = list(value),
        "LanguageISO" => info.language = text(),
        "Manga" => info.reading_direction = reading_direction(value),
        "PageCount" => info.page_count = value.parse().ok(),
        PAGES => {}
        other => {
            info.other.insert(other.to_owned(), value.to_owned());
        }
    }
}

fn list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn reading_direction(manga: &str) -> Option<ReadingDirection> {
    match manga {
        "Yes" | "YesAndRightToLeft" => Some(ReadingDirection::RightToLeft),
        "No" => Some(ReadingDirection::LeftToRight),
        _ => None,
    }
}

fn page_info(element: &BytesStart<'_>) -> Result<PageInfo, ComicInfoError> {
    let mut page = PageInfo::default();
    for attribute in element.attributes() {
        let attribute = attribute.map_err(malformed)?;
        let value = attribute
            .normalized_value(XmlVersion::Implicit1_0)
            .map_err(malformed)?;
        match attribute.key.local_name().as_ref() {
            "Image" => page.image = value.parse().unwrap_or_default(),
            "Type" => page.kind = page_kind(&value),
            "DoublePage" => page.double_page = value.eq_ignore_ascii_case("true"),
            "ImageWidth" => page.width = value.parse().ok(),
            "ImageHeight" => page.height = value.parse().ok(),
            _ => {}
        }
    }
    Ok(page)
}

fn page_kind(value: &str) -> Option<PageKind> {
    Some(match value {
        "FrontCover" => PageKind::FrontCover,
        "InnerCover" => PageKind::InnerCover,
        "Roundup" => PageKind::Roundup,
        "Story" => PageKind::Story,
        "Advertisement" => PageKind::Advertisement,
        "Editorial" => PageKind::Editorial,
        "Letters" => PageKind::Letters,
        "Preview" => PageKind::Preview,
        "BackCover" => PageKind::BackCover,
        "Other" => PageKind::Other,
        "Deleted" => PageKind::Deleted,
        _ => return None,
    })
}

fn malformed(error: impl std::fmt::Display) -> ComicInfoError {
    ComicInfoError::Malformed {
        reason: error.to_string(),
    }
}
