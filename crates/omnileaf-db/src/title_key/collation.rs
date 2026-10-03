use icu_collator::{
    Collator, CollatorBorrowed, CollatorPreferences,
    options::{AlternateHandling, CollatorOptions, Strength},
    preferences::CollationNumericOrdering,
};

use crate::{Error, title_key::Language};

/// Makes the sort keys titles are listed by, which compare bytewise in the order the language's readers expect.
pub(crate) struct TitleCollation {
    collator: CollatorBorrowed<'static>,
}

impl TitleCollation {
    /// Sorts numbers by value, and lets case, accents, then punctuation and spaces decide only between titles otherwise equal.
    pub(crate) fn new(language: &Language) -> Result<Self, Error> {
        let mut preferences = CollatorPreferences::from(language.locale());
        preferences.numeric_ordering = Some(CollationNumericOrdering::True);
        let mut options = CollatorOptions::default();
        options.strength = Some(Strength::Quaternary);
        options.alternate_handling = Some(AlternateHandling::Shifted);
        let collator =
            Collator::try_new(preferences, options).map_err(|source| Error::Collation {
                language: language.to_string(),
                source,
            })?;
        Ok(Self { collator })
    }

    pub(crate) fn key(&self, title: &str) -> Vec<u8> {
        let mut key = Vec::with_capacity(title.len());
        let Ok(()) = self.collator.write_sort_key_to(title, &mut key);
        key
    }
}
