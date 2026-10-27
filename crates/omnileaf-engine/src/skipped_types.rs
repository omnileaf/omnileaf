use std::{collections::BTreeMap, path::PathBuf};

use serde::Serialize;
use specta::Type;

use crate::file_type::FileType;

const LOCATIONS_LISTED_PER_TYPE: usize = 20;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SkippedType {
    pub file_type: FileType,
    pub files: u32,
    pub first_locations: Vec<String>,
}

#[derive(Debug)]
pub(crate) struct SkippedFile {
    pub(crate) file_type: FileType,
    pub(crate) location: PathBuf,
}

#[derive(Debug, Default)]
pub(crate) struct SkippedTypes(BTreeMap<FileType, SkippedType>);

impl SkippedTypes {
    pub(crate) fn note(&mut self, file: &SkippedFile) {
        let skipped = self
            .0
            .entry(file.file_type.clone())
            .or_insert_with(|| SkippedType {
                file_type: file.file_type.clone(),
                files: 0,
                first_locations: Vec::new(),
            });
        skipped.files = skipped.files.saturating_add(1);
        if skipped.first_locations.len() < LOCATIONS_LISTED_PER_TYPE {
            skipped
                .first_locations
                .push(file.location.display().to_string());
        }
    }
}

impl From<SkippedTypes> for Vec<SkippedType> {
    fn from(skipped: SkippedTypes) -> Self {
        skipped.0.into_values().collect()
    }
}
