use omnileaf_db::catalog::{self, BookSummary};
use serde::{Deserialize, Serialize};
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
    pub bookmark_count: u32,
    pub cover: Option<CoverPath>,
    pub folder: Option<String>,
    /// The book reading goes on from, absent once every book is read.
    pub up_next: Option<SeriesBook>,
    /// The kind of book, such as manga or a light novel, absent until the library reads the books' details.
    pub format: Option<String>,
    pub creators: Vec<SeriesCreator>,
    pub summary: Option<String>,
    pub tags: Vec<String>,
    /// Other series in the library that share a creator or a tag with this one.
    pub related: Vec<RelatedSeries>,
    /// About how long the books left take to read at the reading speed learned on this device, absent until the library times reading or while a book left has no page count.
    pub seconds_left: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RelatedSeries {
    pub id: SeriesId,
    pub title: String,
    pub cover: Option<CoverPath>,
    pub book_count: u32,
    pub read_count: u32,
    pub reason: RelatedReason,
    /// Counts as 18+, which a library that reads no age ratings and keeps no marks never does.
    pub is_adult: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RelatedReason {
    SameWriter,
    SameArtist,
    SharedTag { tag: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesCreator {
    pub name: String,
    /// Absent when the books' details name the creator without saying what they did.
    pub role: Option<CreatorRole>,
    /// How many series in the library name this creator, this one included.
    pub series_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatorSeries {
    pub id: SeriesId,
    pub title: String,
    pub cover: Option<CoverPath>,
    pub role: Option<CreatorRole>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CreatorRole {
    Story,
    Art,
    StoryAndArt,
}

impl SeriesOverview {
    pub(crate) fn new(
        overview: catalog::SeriesOverview,
        up_next: Option<BookSummary>,
        seconds_per_page: Option<u32>,
    ) -> Self {
        let seconds_left = overview
            .pages_left
            .zip(seconds_per_page)
            .map(|(pages, seconds)| pages.saturating_mul(seconds));
        Self {
            id: SeriesId(overview.id),
            title: overview.title,
            book_count: overview.book_count,
            read_count: overview.read_count,
            bookmark_count: 0,
            cover: overview.cover.map(CoverPath),
            folder: overview
                .folder
                .map(|locator| folder_name(&root_folder(&locator))),
            up_next: up_next.map(SeriesBook::from),
            format: None,
            creators: Vec::new(),
            summary: None,
            tags: Vec::new(),
            related: Vec::new(),
            seconds_left,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGES_LEFT: u32 = 900;
    const SECONDS_PER_PAGE: u32 = 12;

    fn overview_with(pages_left: Option<u32>, seconds_per_page: Option<u32>) -> SeriesOverview {
        SeriesOverview::new(
            catalog::SeriesOverview {
                id: omnileaf_sync_proto::SeriesId::local("Sample Series 04").unwrap(),
                title: "Sample Series 04".to_owned(),
                book_count: 8,
                read_count: 2,
                cover: None,
                folder: None,
                pages_left,
            },
            None,
            seconds_per_page,
        )
    }

    fn sample_overview() -> SeriesOverview {
        overview_with(Some(PAGES_LEFT), None)
    }

    #[test]
    fn finds_no_related_series_until_the_library_reads_creators_and_tags() {
        assert_eq!(sample_overview().related, Vec::new());
    }

    #[test]
    fn tells_the_interface_whether_a_related_series_counts_as_18_plus() {
        let related = RelatedSeries {
            id: sample_overview().id,
            title: "Sample Series 07".to_owned(),
            cover: None,
            book_count: 5,
            read_count: 3,
            reason: RelatedReason::SameWriter,
            is_adult: true,
        };

        let json = serde_json::to_value(related).unwrap();

        assert_eq!(json["isAdult"], serde_json::json!(true));
    }

    #[test]
    fn knows_no_time_left_until_the_library_times_reading() {
        assert_eq!(sample_overview().seconds_left, None);
    }

    #[test]
    fn knows_no_time_left_while_a_book_left_has_no_page_count() {
        let overview = overview_with(None, Some(SECONDS_PER_PAGE));

        assert_eq!(overview.seconds_left, None);
    }

    #[test]
    fn times_the_pages_left_at_the_reading_speed() {
        let overview = overview_with(Some(PAGES_LEFT), Some(SECONDS_PER_PAGE));

        assert_eq!(overview.seconds_left, Some(PAGES_LEFT * SECONDS_PER_PAGE));
    }

    #[test]
    fn counts_no_bookmarks_while_the_library_keeps_none() {
        assert_eq!(sample_overview().bookmark_count, 0);
    }

    #[test]
    fn leaves_a_series_format_creators_summary_and_tags_empty_until_the_library_reads_its_details()
    {
        let overview = sample_overview();

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
