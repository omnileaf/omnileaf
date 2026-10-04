use omnileaf_db::catalog;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{BookId, BookReading, PagePath, SeriesId};

/// A book as the reader shows it, with every page it can ask the `omni` protocol for.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenedBook {
    pub id: BookId,
    pub title: String,
    pub series: SeriesId,
    pub series_title: String,
    /// In reading order.
    pub pages: Vec<BookPage>,
    pub reading: BookReading,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookPage {
    pub path: PagePath,
    /// Absent when the page's image header couldn't be read.
    pub size: Option<PageDimensions>,
}

/// A page's size in pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct PageDimensions {
    pub width: u32,
    pub height: u32,
}

/// A format the webview may be unable to show, which it tries before asking for pages.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProbedFormat {
    Webp,
    Avif,
    Jxl,
}

impl From<catalog::PageDimensions> for PageDimensions {
    fn from(size: catalog::PageDimensions) -> Self {
        Self {
            width: size.width,
            height: size.height,
        }
    }
}
