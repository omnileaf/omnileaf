use omnileaf_db::adult_content::{AdultTreatment as StoredTreatment, StoredAdultContent};
use serde::{Deserialize, Serialize};
use specta::Type;

/// How the library treats series that count as 18+, and whether an adult age rating in their details makes them count.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AdultContent {
    pub treatment: AdultTreatment,
    pub counts_age_ratings: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AdultTreatment {
    Show,
    /// Blurs their covers until each is shown.
    Blur,
    /// Leaves them out of the library, its counts and search.
    Hide,
}

impl Default for AdultContent {
    fn default() -> Self {
        Self {
            treatment: AdultTreatment::Show,
            counts_age_ratings: true,
        }
    }
}

impl From<StoredAdultContent> for AdultContent {
    fn from(stored: StoredAdultContent) -> Self {
        Self {
            treatment: match stored.treatment {
                StoredTreatment::Show => AdultTreatment::Show,
                StoredTreatment::Blur => AdultTreatment::Blur,
                StoredTreatment::Hide => AdultTreatment::Hide,
            },
            counts_age_ratings: stored.counts_age_ratings,
        }
    }
}

impl From<AdultContent> for StoredAdultContent {
    fn from(content: AdultContent) -> Self {
        Self {
            treatment: match content.treatment {
                AdultTreatment::Show => StoredTreatment::Show,
                AdultTreatment::Blur => StoredTreatment::Blur,
                AdultTreatment::Hide => StoredTreatment::Hide,
            },
            counts_age_ratings: content.counts_age_ratings,
        }
    }
}
