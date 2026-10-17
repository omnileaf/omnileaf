use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

const PREFIX: &str = "R-";
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SYMBOLS: u32 = 4;
const BITS_PER_SYMBOL: u32 = 5;
const SYMBOL_MASK: u32 = (1 << BITS_PER_SYMBOL) - 1;

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
    pub fn from_random(random: u32) -> Self {
        let symbols: String = (0..SYMBOLS)
            .map(|place| (random >> (place * BITS_PER_SYMBOL)) & SYMBOL_MASK)
            .filter_map(|index| ALPHABET.get(usize::try_from(index).ok()?))
            .map(|symbol| char::from(*symbol))
            .collect();
        Self(format!("{PREFIX}{symbols}"))
    }
}

impl fmt::Display for ReportCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

fn is_report_code(text: &str) -> bool {
    text.strip_prefix(PREFIX).is_some_and(|symbols| {
        symbols.len() == SYMBOLS as usize
            && symbols.bytes().all(|symbol| ALPHABET.contains(&symbol))
    })
}

impl TryFrom<String> for ReportCode {
    type Error = NotAReportCode;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        if is_report_code(&text) {
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
