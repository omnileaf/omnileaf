use serde::{Deserialize, Serialize};
use specta::Type;

use crate::library_category::{CategoryId, LibraryCategory};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesLabels {
    pub keeps_labels: bool,
    pub categories: Vec<CategoryHeld>,
    pub tags: Vec<TagHeld>,
    pub suggested_tags: Vec<String>,
}

/// How many of the series asked about are in the category.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CategoryHeld {
    pub category: LibraryCategory,
    pub holding: u32,
}

/// How many of the series asked about carry the tag.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TagHeld {
    pub tag: String,
    pub holding: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LabelChanges {
    pub categories_added: Vec<CategoryId>,
    pub categories_removed: Vec<CategoryId>,
    pub categories_created: Vec<String>,
    pub tags_added: Vec<String>,
    pub tags_removed: Vec<String>,
}
