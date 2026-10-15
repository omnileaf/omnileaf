use omnileaf_db::catalog;
use omnileaf_imaging::PageFormat;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{BookId, BookReading, CoverPath, PagePath, PageThumbnailPath, SeriesId};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenedBook {
    pub id: BookId,
    pub title: String,
    pub series: SeriesId,
    pub series_title: String,
    /// In reading order.
    pub pages: Vec<BookPage>,
    /// The page the reader opens on, counting from 0.
    pub start_page: u32,
    pub reading: BookReading,
    /// Counting from 1 in the series' order.
    pub position: u32,
    pub previous: Option<SeriesNeighbour>,
    pub next: Option<SeriesNeighbour>,
    /// Absent when the book's details don't say which way it reads.
    pub reading_direction: Option<ReadingDirection>,
    /// Counting from 0; absent while the library keeps no bookmarks.
    pub bookmarked_pages: Option<Vec<u32>>,
    /// Absent while the library doesn't check a book's pages against what its file promises.
    pub damage: Option<BookDamage>,
}

/// What's wrong with a book that opens with fewer pages than its file promises, the pages past the last one in `pages` being the ones lost.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookDamage {
    pub promised_pages: u32,
    pub cause: DamageCause,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DamageCause {
    ArchiveEndsEarly,
}

/// Where a book sits, found without opening its file, so a book that won't open still names its way back.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookPlace {
    pub id: BookId,
    pub title: String,
    pub series: SeriesId,
    pub series_title: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ReadingDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesNeighbour {
    pub id: BookId,
    pub title: String,
    /// The book's own cover, absent while it has no file.
    pub cover: Option<CoverPath>,
    pub reading: BookReading,
    /// Absent until the library keeps how many pages each book has.
    pub page_count: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookPage {
    pub path: PagePath,
    pub thumbnail: PageThumbnailPath,
    /// Absent when the page's image header couldn't be read, or wasn't yet for a page far from where the book opened the first time.
    pub size: Option<PageDimensions>,
}

/// In pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct PageDimensions {
    pub width: u32,
    pub height: u32,
}

/// A format the webview may be unable to show, which it tries before asking for pages, limited to the formats pages can be transcoded from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProbedFormat {
    Webp,
    Jxl,
}

impl ProbedFormat {
    pub(crate) fn of(format: PageFormat) -> Option<Self> {
        match format {
            PageFormat::Webp => Some(Self::Webp),
            PageFormat::Jxl => Some(Self::Jxl),
            PageFormat::Avif
            | PageFormat::Jpeg
            | PageFormat::Png
            | PageFormat::Gif
            | PageFormat::Bmp => None,
        }
    }
}

impl From<omnileaf_formats::ReadingDirection> for ReadingDirection {
    fn from(direction: omnileaf_formats::ReadingDirection) -> Self {
        match direction {
            omnileaf_formats::ReadingDirection::LeftToRight => Self::LeftToRight,
            omnileaf_formats::ReadingDirection::RightToLeft => Self::RightToLeft,
        }
    }
}

impl From<catalog::SeriesNeighbour> for SeriesNeighbour {
    fn from(neighbour: catalog::SeriesNeighbour) -> Self {
        Self {
            id: BookId(neighbour.id),
            title: neighbour.title,
            cover: neighbour.cover.map(CoverPath),
            reading: neighbour.reading.into(),
            page_count: None,
        }
    }
}

impl From<catalog::PageDimensions> for PageDimensions {
    fn from(size: catalog::PageDimensions) -> Self {
        Self {
            width: size.width,
            height: size.height,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probes_the_formats_pages_are_transcoded_from_and_sends_the_rest_as_they_are() {
        let formats = [
            PageFormat::Jpeg,
            PageFormat::Png,
            PageFormat::Gif,
            PageFormat::Bmp,
            PageFormat::Webp,
            PageFormat::Avif,
            PageFormat::Jxl,
        ];

        let probed = formats.map(ProbedFormat::of);

        assert_eq!(
            probed,
            [
                None,
                None,
                None,
                None,
                Some(ProbedFormat::Webp),
                None,
                Some(ProbedFormat::Jxl)
            ]
        );
    }
}
