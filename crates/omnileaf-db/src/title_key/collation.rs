use icu_collator::{
    Collator, CollatorBorrowed, CollatorPreferences,
    options::{AlternateHandling, CollatorOptions, Strength},
    preferences::CollationNumericOrdering,
};

use crate::{
    Error,
    title_key::{
        Language,
        articles::{Article, articles_of, without_leading_article},
    },
};

/// Makes the sort keys titles are listed by, which compare bytewise in the order the language's readers expect.
pub(crate) struct TitleCollation {
    collator: CollatorBorrowed<'static>,
    articles: &'static [Article],
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
        Ok(Self {
            collator,
            articles: articles_of(language),
        })
    }

    /// Keys the title without its leading article, so it files under the word readers look it up by.
    pub(crate) fn key(&self, title: &str) -> Vec<u8> {
        let sorted_by = without_leading_article(title, self.articles);
        let mut key = Vec::with_capacity(sorted_by.len());
        let Ok(()) = self.collator.write_sort_key_to(sorted_by, &mut key);
        key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(language: &str, titles: [&str; 2]) -> [Vec<u8>; 2] {
        let collation = TitleCollation::new(&language.parse().unwrap()).unwrap();
        titles.map(|title| collation.key(title))
    }

    #[test]
    fn keys_a_title_as_it_would_be_keyed_without_its_leading_article() {
        let [with_article, without] = keys("en", ["The Sample", "Sample"]);

        assert_eq!(with_article, without);
    }

    #[test]
    fn keeps_an_article_of_another_language_in_the_key() {
        let [with_article, without] = keys("ja", ["The Sample", "Sample"]);

        assert_ne!(with_article, without);
    }
}
