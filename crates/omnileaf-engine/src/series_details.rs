use omnileaf_db::catalog::{self, SeriesFileDetails, Sourced};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{CreatorRole, ValueSource};

/// A series' details as its files give them, each with the edit kept over it, which is never written into the files.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetails {
    pub title: EditedTitle,
    pub people: EditedPeople,
    pub tags: EditedTags,
    pub summary: EditedSummary,
    pub year: Option<SourcedYear>,
    pub language: Option<SourcedLanguage>,
    /// Marked 18+ by hand, for a series whose files carry no age rating.
    pub is_marked_adult: bool,
    /// The files rate the series 18+, so the mark has nothing to add.
    pub is_rated_adult: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditedTitle {
    pub from_file: String,
    /// Absent for a series keyed by name alone, which its next rescan files by folder.
    pub source: Option<ValueSource>,
    pub edited: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SourcedYear {
    pub from_file: u16,
    pub source: ValueSource,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SourcedLanguage {
    pub from_file: String,
    pub source: ValueSource,
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
        overview: catalog::SeriesOverview,
        details: SeriesFileDetails,
    ) -> Self {
        Self {
            title: EditedTitle {
                from_file: overview.title,
                source: overview.title_source.map(ValueSource::from),
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
            year: overview.year.map(SourcedYear::from),
            language: overview.language.map(SourcedLanguage::from),
            is_marked_adult: false,
            is_rated_adult: overview.is_rated_adult,
        }
    }
}

impl From<Sourced<u16>> for SourcedYear {
    fn from(year: Sourced<u16>) -> Self {
        Self {
            from_file: year.value,
            source: year.source.into(),
        }
    }
}

impl From<Sourced<String>> for SourcedLanguage {
    fn from(language: Sourced<String>) -> Self {
        Self {
            from_file: language.value,
            source: language.source.into(),
        }
    }
}
