use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

const PREFIX: &str = "R-";
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const EARLIER_SYMBOLS: usize = 4;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(transparent)]
pub struct ReportCode(String);

#[derive(Debug, thiserror::Error)]
#[error("{text:?} isn't a problem report's code")]
pub struct NotAReportCode {
    text: String,
}

impl ReportCode {
    #[must_use]
    pub fn from_random(random: [u8; 5]) -> Self {
        Self(omnileaf_relay_proto::ReportCode::from_random(random).to_string())
    }

    #[must_use]
    pub fn to_relay(&self) -> Option<omnileaf_relay_proto::ReportCode> {
        omnileaf_relay_proto::ReportCode::try_from(self.0.clone()).ok()
    }
}

impl fmt::Display for ReportCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

fn is_earlier_report_code(text: &str) -> bool {
    text.strip_prefix(PREFIX).is_some_and(|symbols| {
        symbols.len() == EARLIER_SYMBOLS && symbols.bytes().all(|symbol| ALPHABET.contains(&symbol))
    })
}

impl TryFrom<String> for ReportCode {
    type Error = NotAReportCode;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let is_relay_code = omnileaf_relay_proto::ReportCode::try_from(text.clone()).is_ok();
        if is_relay_code || is_earlier_report_code(&text) {
            Ok(Self(text))
        } else {
            Err(NotAReportCode { text })
        }
    }
}

impl<'de> Deserialize<'de> for ReportCode {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}
