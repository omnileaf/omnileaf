use std::path::Path;

use omnileaf_db::catalog::{self, ValueSource};
use serde::Serialize;
use specta::Type;

use crate::{BookNumber, CoverPath, library_layout::folder_name};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesVolume {
    pub volume: BookNumber,
    /// The name of the folder the volume's chapters are filed in, absent when their volume number comes from their file names.
    pub folder: Option<String>,
    pub cover: Option<CoverPath>,
    pub book_count: u32,
    pub read_count: u32,
}

impl SeriesVolume {
    pub(crate) fn new(volume: BookNumber, found: &catalog::VolumeOverview) -> Self {
        Self {
            volume,
            folder: found
                .cover_location
                .as_deref()
                .filter(|_| found.volume_source == Some(ValueSource::FolderName))
                .and_then(volume_folder),
            cover: found.cover.map(CoverPath),
            book_count: found.book_count,
            read_count: found.read_count,
        }
    }
}

fn volume_folder(file: &Path) -> Option<String> {
    let folder = file.parent()?;
    folder.file_name()?;
    Some(folder_name(folder))
}
