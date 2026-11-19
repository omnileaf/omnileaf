use omnileaf_db::catalog;
use serde::Serialize;
use specta::Type;

use crate::BookNumber;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChapterVolume {
    pub volume: BookNumber,
    pub book_count: u32,
    pub read_count: u32,
    pub started_count: u32,
}

impl From<catalog::ChapterVolume> for ChapterVolume {
    fn from(counted: catalog::ChapterVolume) -> Self {
        Self {
            volume: counted.volume.into(),
            book_count: counted.book_count,
            read_count: counted.read_count,
            started_count: counted.started_count,
        }
    }
}
