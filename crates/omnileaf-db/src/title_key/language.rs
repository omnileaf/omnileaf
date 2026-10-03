use std::{fmt, str::FromStr};

use icu_locale_core::Locale;

use crate::Error;

/// The app's language, as the BCP 47 tag whose collation and leading articles titles sort by.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Language(Locale);

impl Language {
    /// The root collation, which already suits most languages without a tailoring of their own.
    pub(crate) const ROOT: Self = Self(Locale::UNKNOWN);

    pub(crate) const fn locale(&self) -> &Locale {
        &self.0
    }
}

impl FromStr for Language {
    type Err = Error;

    fn from_str(tag: &str) -> Result<Self, Error> {
        Locale::try_from_str(tag)
            .map(Self)
            .map_err(|_| Error::MalformedLanguage {
                tag: tag.to_owned(),
            })
    }
}

impl fmt::Display for Language {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_tag_read_in_any_case_in_its_canonical_form() {
        let language: Language = "SV-se".parse().unwrap();

        assert_eq!(language.to_string(), "sv-SE");
    }

    #[test]
    fn refuses_text_that_is_not_a_language_tag() {
        let outcome = "not a language".parse::<Language>();

        assert!(matches!(
            outcome,
            Err(Error::MalformedLanguage { tag }) if tag == "not a language"
        ));
    }
}
