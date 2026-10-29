use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};

const PREFIX: &str = "R-";
const SEPARATOR: char = '-';
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP_SYMBOLS: usize = 4;
const GROUPS: usize = 2;
const BITS_PER_SYMBOL: usize = 5;
const SYMBOL_MASK: u64 = (1 << BITS_PER_SYMBOL) - 1;

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct ReportCode(String);

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("{text:?} isn't a problem report's code")]
pub struct NotAReportCode {
    text: String,
}

impl ReportCode {
    #[must_use]
    pub fn from_random(random: [u8; 5]) -> Self {
        let bits = random
            .iter()
            .rev()
            .fold(0_u64, |bits, byte| (bits << 8) | u64::from(*byte));
        let symbols: Vec<char> = (0..GROUP_SYMBOLS * GROUPS)
            .map(|place| (bits >> (place * BITS_PER_SYMBOL)) & SYMBOL_MASK)
            .filter_map(|index| ALPHABET.get(usize::try_from(index).ok()?))
            .map(|symbol| char::from(*symbol))
            .collect();
        let groups: Vec<String> = symbols
            .chunks(GROUP_SYMBOLS)
            .map(|group| group.iter().collect())
            .collect();
        Self(format!("{PREFIX}{}", groups.join(&SEPARATOR.to_string())))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ReportCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

fn is_report_code(text: &str) -> bool {
    text.strip_prefix(PREFIX).is_some_and(|symbols| {
        let groups: Vec<&str> = symbols.split(SEPARATOR).collect();
        groups.len() == GROUPS && groups.iter().all(|group| is_symbol_group(group))
    })
}

fn is_symbol_group(group: &str) -> bool {
    group.len() == GROUP_SYMBOLS && group.bytes().all(|symbol| ALPHABET.contains(&symbol))
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
