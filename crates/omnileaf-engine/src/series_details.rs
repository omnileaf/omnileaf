use omnileaf_db::catalog::SeriesFileDetails;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::CreatorRole;

/// A series' details as its files give them, each with the edit kept over it, which is never written into the files.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetails {
    pub title: EditedTitle,
    pub people: EditedPeople,
    pub tags: EditedTags,
    pub summary: EditedSummary,
    /// Marked 18+ by hand, for a series whose files carry no age rating.
    pub is_marked_adult: bool,
    /// The files rate the series 18+, so the mark has nothing to add.
    pub is_rated_adult: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditedTitle {
    pub from_file: String,
    pub edited: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditedPeople {
    pub from_file: Vec<SeriesPerson>,
    pub edited: Option<Vec<SeriesPerson>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditedTags {
    pub from_file: Vec<String>,
    pub edited: Option<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditedSummary {
    pub from_file: Option<String>,
    pub edited: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPerson {
    pub name: String,
    pub role: Option<CreatorRole>,
}

/// The details to keep over a series' files; an absent field goes back to the file's.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DetailEdits {
    pub title: Option<String>,
    pub people: Option<Vec<SeriesPerson>>,
    pub tags: Option<Vec<String>>,
    pub summary: Option<String>,
    pub is_marked_adult: bool,
}

impl SeriesDetails {
    pub(crate) fn from_files(
        title: String,
        details: SeriesFileDetails,
        is_rated_adult: bool,
    ) -> Self {
        Self {
            title: EditedTitle {
                from_file: title,
                edited: None,
            },
            people: EditedPeople {
                from_file: details
                    .people
                    .into_iter()
                    .map(|person| SeriesPerson {
                        role: CreatorRole::of(&person.roles),
                        name: person.name,
                    })
                    .collect(),
                edited: None,
            },
            tags: EditedTags {
                from_file: details.tags,
                edited: None,
            },
            summary: EditedSummary {
                from_file: details.summary,
                edited: None,
            },
            is_marked_adult: false,
            is_rated_adult,
        }
    }
}
