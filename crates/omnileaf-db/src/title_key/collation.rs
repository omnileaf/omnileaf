use icu_collator::{
    Collator, CollatorBorrowed, CollatorPreferences,
    options::{AlternateHandling, CollatorOptions, Strength},
    preferences::CollationNumericOrdering,
};
use rusqlite::Connection;

use crate::{
    Error,
    title_key::{
        Language,
        articles::{Article, articles_of, without_leading_article},
        stored_language,
    },
};

const NUMERIC_ORDERING: CollationNumericOrdering = CollationNumericOrdering::True;

pub(crate) struct TitleCollation {
    collator: CollatorBorrowed<'static>,
    articles: &'static [Article],
}

impl TitleCollation {
    pub(crate) fn new(language: &Language) -> Result<Self, Error> {
        let mut preferences = CollatorPreferences::from(language.locale());
        preferences.numeric_ordering = Some(NUMERIC_ORDERING);
        let collator =
            Collator::try_new(preferences, options()).map_err(|source| Error::Collation {
                language: language.to_string(),
                source,
            })?;
        Ok(Self {
            collator,
            articles: articles_of(language),
        })
    }

    pub(crate) fn stored(connection: &Connection) -> Result<Self, Error> {
        Self::new(&stored_language(connection)?)
    }

    pub(crate) fn rules(language: &Language) -> String {
        format!(
            "{:?} {NUMERIC_ORDERING:?} {:?}",
            options(),
            articles_of(language)
        )
    }

    pub(crate) fn key(&self, title: &str) -> Vec<u8> {
        let sorted_by = without_leading_article(title, self.articles);
        let mut key = Vec::with_capacity(sorted_by.len());
        let Ok(()) = self.collator.write_sort_key_to(sorted_by, &mut key);
        key
    }
}

fn options() -> CollatorOptions {
    let mut options = CollatorOptions::default();
    options.strength = Some(Strength::Quaternary);
    options.alternate_handling = Some(AlternateHandling::Shifted);
    options
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
    fn describes_the_settings_and_the_article_list_of_the_language() {
        let rules = ["en", "ja"].map(|language| TitleCollation::rules(&language.parse().unwrap()));

        assert!(rules[0].contains("Quaternary") && rules[0].contains("Shifted"));
        assert!(rules[0].contains("True"));
        assert!(rules[0].contains(r#"Word("the")"#));
        assert!(!rules[1].contains(r#"Word("the")"#));
    }

    #[test]
    fn keeps_an_article_of_another_language_in_the_key() {
        let [with_article, without] = keys("ja", ["The Sample", "Sample"]);

        assert_ne!(with_article, without);
    }
}
