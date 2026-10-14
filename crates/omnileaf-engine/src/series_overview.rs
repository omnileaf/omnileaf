use omnileaf_db::catalog::{self, BookSummary};
use serde::Serialize;
use specta::Type;

use crate::{
    CoverPath, SeriesBook, SeriesId, library_folder::root_folder, library_layout::folder_name,
};

/// What a series' page shows above its books.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesOverview {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub read_count: u32,
    /// The cover the library shows for the series, absent while none of its books has a file.
    pub cover: Option<CoverPath>,
    /// The name of the library folder holding the cover's book.
    pub folder: Option<String>,
    /// The book reading goes on from, absent once every book is read.
    pub up_next: Option<SeriesBook>,
}

impl SeriesOverview {
    pub(crate) fn new(overview: catalog::SeriesOverview, up_next: Option<BookSummary>) -> Self {
        Self {
            id: SeriesId(overview.id),
            title: overview.title,
            book_count: overview.book_count,
            read_count: overview.read_count,
            cover: overview.cover.map(CoverPath),
            folder: overview
                .folder
                .map(|locator| folder_name(&root_folder(&locator))),
            up_next: up_next.map(SeriesBook::from),
        }
    }
}
