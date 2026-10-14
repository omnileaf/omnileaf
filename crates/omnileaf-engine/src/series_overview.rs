use omnileaf_db::catalog::{self, BookSummary};
use serde::Serialize;
use specta::Type;

use crate::{
    CoverPath, SeriesBook, SeriesId, library_folder::root_folder, library_layout::folder_name,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesOverview {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub read_count: u32,
    pub cover: Option<CoverPath>,
    pub folder: Option<String>,
    /// The book reading goes on from, absent once every book is read.
    pub up_next: Option<SeriesBook>,
    /// The kind of book, such as manga or a light novel, absent until the library reads the books' details.
    pub format: Option<String>,
    pub creators: Vec<SeriesCreator>,
    pub summary: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesCreator {
    pub name: String,
    /// Absent when the books' details name the creator without saying what they did.
    pub role: Option<CreatorRole>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CreatorRole {
    Story,
    Art,
    StoryAndArt,
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
            format: None,
            creators: Vec::new(),
            summary: None,
            tags: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_a_series_format_creators_summary_and_tags_empty_until_the_library_reads_its_details()
    {
        let overview = SeriesOverview::new(
            catalog::SeriesOverview {
                id: omnileaf_sync_proto::SeriesId::local("Sample Series 04").unwrap(),
                title: "Sample Series 04".to_owned(),
                book_count: 8,
                read_count: 2,
                cover: None,
                folder: None,
            },
            None,
        );

        assert_eq!(
            (
                overview.format,
                overview.creators,
                overview.summary,
                overview.tags
            ),
            (None, Vec::new(), None, Vec::new())
        );
    }
}
