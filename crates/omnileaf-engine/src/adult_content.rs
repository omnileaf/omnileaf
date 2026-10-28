use omnileaf_db::{
    adult_content::{
        AdultHiding, AdultTreatment as StoredTreatment, StoredAdultContent, adult_content,
    },
    rusqlite::Connection,
};
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

impl AdultContent {
    fn stored(connection: &Connection) -> Result<Self, omnileaf_db::Error> {
        Ok(adult_content(connection)?
            .map(Self::from)
            .unwrap_or_default())
    }

    pub(crate) const fn counts_as_adult(self, is_rated_adult: bool, is_marked_adult: bool) -> bool {
        is_marked_adult || (self.counts_age_ratings && is_rated_adult)
    }

    pub(crate) const fn hides_adult(self) -> bool {
        matches!(self.treatment, AdultTreatment::Hide)
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct AdultSeen {
    screenshot_mode: bool,
}

impl AdultSeen {
    pub(crate) const fn while_screenshot_mode_is(is_on: bool) -> Self {
        Self {
            screenshot_mode: is_on,
        }
    }

    pub(crate) fn stored_setting(
        connection: &Connection,
    ) -> Result<AdultContent, omnileaf_db::Error> {
        AdultContent::stored(connection)
    }

    pub(crate) fn hiding(self, connection: &Connection) -> Result<AdultHiding, omnileaf_db::Error> {
        Ok(self.view(connection)?.hiding())
    }

    pub(crate) fn view(self, connection: &Connection) -> Result<AdultView, omnileaf_db::Error> {
        Ok(AdultView {
            setting: AdultContent::stored(connection)?,
            screenshot_mode: self.screenshot_mode,
        })
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct AdultView {
    setting: AdultContent,
    screenshot_mode: bool,
}

impl AdultView {
    pub(crate) const fn setting(self) -> AdultContent {
        self.setting
    }

    pub(crate) const fn in_screenshot_mode(self) -> bool {
        self.screenshot_mode
    }

    pub(crate) const fn leaves_out_adult_series(self) -> bool {
        self.screenshot_mode || self.setting.hides_adult()
    }

    pub(crate) const fn hiding(self) -> AdultHiding {
        AdultHiding {
            leaves_out_adult: self.screenshot_mode,
            counts_age_ratings: self.setting.counts_age_ratings,
        }
    }
}

impl From<AdultContent> for AdultView {
    fn from(setting: AdultContent) -> Self {
        Self {
            setting,
            screenshot_mode: false,
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
