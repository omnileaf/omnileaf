use omnileaf_db::catalog::{self, Cursor};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{BookId, SeriesId, ipc_brand::branded_string};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ChapterTitleSource {
    FileName,
    ComicInfo,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChapterHit {
    pub series: SeriesId,
    pub series_title: String,
    pub book: BookId,
    pub position: u32,
    pub title: String,
    pub matched_in: ChapterTitleSource,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChapterHitPage {
    pub hits: Vec<ChapterHit>,
    pub next: Option<ChapterCursor>,
    pub count: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct ChapterCursor(pub(crate) Cursor);

impl From<catalog::ChapterTitleSource> for ChapterTitleSource {
    fn from(source: catalog::ChapterTitleSource) -> Self {
        match source {
            catalog::ChapterTitleSource::FileName => Self::FileName,
            catalog::ChapterTitleSource::ComicInfo => Self::ComicInfo,
        }
    }
}

impl From<catalog::ChapterHit> for ChapterHit {
    fn from(hit: catalog::ChapterHit) -> Self {
        Self {
            series: SeriesId(hit.series),
            series_title: hit.series_title,
            book: BookId(hit.book),
            position: hit.position,
            title: hit.title,
            matched_in: hit.matched_in.into(),
        }
    }
}

impl From<ChapterCursor> for String {
    fn from(cursor: ChapterCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for ChapterCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for ChapterCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("ChapterCursor", types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hands_a_hit_over_with_its_ids_position_and_the_title_it_matched_in() {
        let series = omnileaf_sync_proto::SeriesId::local("Sample Series 01").unwrap();
        let book = omnileaf_sync_proto::BookId::local(
            &omnileaf_sync_proto::Fingerprint::pmf1([omnileaf_sync_proto::ImageEntry {
                crc32: 3,
                size: 1,
            }])
            .unwrap(),
        );
        let stored = catalog::ChapterHit {
            series,
            series_title: "Sample Series 01".to_owned(),
            book,
            position: 3,
            title: "Chapter 3".to_owned(),
            matched_in: catalog::ChapterTitleSource::ComicInfo,
        };

        let hit = ChapterHit::from(stored);

        assert_eq!(
            hit,
            ChapterHit {
                series: SeriesId(series),
                series_title: "Sample Series 01".to_owned(),
                book: BookId(book),
                position: 3,
                title: "Chapter 3".to_owned(),
                matched_in: ChapterTitleSource::ComicInfo,
            }
        );
    }
}
