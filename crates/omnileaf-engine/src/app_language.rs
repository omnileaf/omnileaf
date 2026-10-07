use std::{fmt, str::FromStr};

use omnileaf_db::Language;
use serde::Deserialize;
use specta::{Type, Types, datatype::DataType};

/// The language the interface shows, as the BCP 47 tag it chose, which the library sorts titles by.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(try_from = "String")]
pub struct AppLanguage(pub(crate) Language);

impl FromStr for AppLanguage {
    type Err = omnileaf_db::Error;

    fn from_str(tag: &str) -> Result<Self, Self::Err> {
        tag.parse().map(Self)
    }
}

impl TryFrom<String> for AppLanguage {
    type Error = omnileaf_db::Error;

    fn try_from(tag: String) -> Result<Self, Self::Error> {
        tag.parse()
    }
}

impl fmt::Display for AppLanguage {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl Type for AppLanguage {
    fn definition(types: &mut Types) -> DataType {
        String::definition(types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crosses_from_the_interface_as_its_language_tag() {
        let language: AppLanguage = serde_json::from_str("\"sv-SE\"").unwrap();

        assert_eq!(language.to_string(), "sv-SE");
    }

    #[test]
    fn refuses_text_that_is_not_a_language_tag() {
        let outcome = serde_json::from_str::<AppLanguage>("\"not a language\"");

        assert!(outcome.is_err());
    }
}
