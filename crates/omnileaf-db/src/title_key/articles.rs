use crate::title_key::Language;

/// A leading article of one language, written in lower case.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Article {
    /// Stands apart, with a space before the next word.
    Word(&'static str),
    /// Runs into the next word after an apostrophe.
    Elided(&'static str),
}

const ENGLISH: &[Article] = &[
    Article::Word("the"),
    Article::Word("a"),
    Article::Word("an"),
];
const FRENCH: &[Article] = &[
    Article::Word("le"),
    Article::Word("la"),
    Article::Word("les"),
    Article::Elided("l"),
    Article::Word("un"),
    Article::Word("une"),
];
const GERMAN: &[Article] = &[
    Article::Word("der"),
    Article::Word("die"),
    Article::Word("das"),
    Article::Word("ein"),
    Article::Word("eine"),
];
const SWEDISH: &[Article] = &[Article::Word("en"), Article::Word("ett")];
const NO_ARTICLES: &[Article] = &[];
const APOSTROPHES: [char; 2] = ['\'', '\u{2019}'];

pub(crate) fn articles_of(language: &Language) -> &'static [Article] {
    match language.code() {
        "en" => ENGLISH,
        "fr" => FRENCH,
        "de" => GERMAN,
        "sv" => SWEDISH,
        _ => NO_ARTICLES,
    }
}

/// Drops the first article only when another word follows it, so a title that is only an article keeps it.
pub(crate) fn without_leading_article<'t>(title: &'t str, articles: &[Article]) -> &'t str {
    articles
        .iter()
        .find_map(|article| article.strip_from(title))
        .unwrap_or(title)
}

impl Article {
    fn strip_from(self, title: &str) -> Option<&str> {
        let following = match self {
            Self::Word(word) => {
                let rest = strip_prefix_ignoring_case(title, word)?;
                let next_word = rest.trim_start();
                (next_word.len() < rest.len()).then_some(next_word)?
            }
            Self::Elided(word) => strip_prefix_ignoring_case(title, word)?
                .strip_prefix(APOSTROPHES)?
                .trim_start(),
        };
        (!following.is_empty()).then_some(following)
    }
}

fn strip_prefix_ignoring_case<'t>(text: &'t str, prefix: &str) -> Option<&'t str> {
    let head = text.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix)
        .then(|| text.get(prefix.len()..))
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stripped(language: &str, titles: &[&'static str]) -> Vec<&'static str> {
        let articles = articles_of(&language.parse().unwrap());
        titles
            .iter()
            .map(|title| without_leading_article(title, articles))
            .collect()
    }

    #[test]
    fn drops_an_english_article_before_another_word() {
        let titles = stripped(
            "en",
            &["The Sample", "A Sample", "An Sample", "the  Sample"],
        );

        assert_eq!(titles, ["Sample", "Sample", "Sample", "Sample"]);
    }

    #[test]
    fn keeps_an_article_with_no_word_after_it() {
        let titles = stripped("en", &["The", "The ", "A"]);

        assert_eq!(titles, ["The", "The ", "A"]);
    }

    #[test]
    fn keeps_a_word_that_only_begins_like_an_article() {
        let titles = stripped(
            "en",
            &["Theory Sample", "Another Sample", "A-Sample", "Abc"],
        );

        assert_eq!(
            titles,
            ["Theory Sample", "Another Sample", "A-Sample", "Abc"]
        );
    }

    #[test]
    fn matches_an_article_in_any_case() {
        let titles = stripped("en", &["THE SAMPLE", "tHe Sample"]);

        assert_eq!(titles, ["SAMPLE", "Sample"]);
    }

    #[test]
    fn drops_an_elided_french_article_before_the_word_it_runs_into() {
        let titles = stripped("fr", &["L'Exemple", "L’Exemple", "Les Exemples", "L'"]);

        assert_eq!(titles, ["Exemple", "Exemple", "Exemples", "L'"]);
    }

    #[test]
    fn drops_only_the_articles_of_the_language_given() {
        let titles = [
            stripped("de", &["Die Probe", "The Sample"]),
            stripped("en", &["Die Probe"]),
            stripped("sv-SE", &["En Prov", "Ett Prov"]),
            stripped("ja", &["The Sample"]),
        ]
        .concat();

        assert_eq!(
            titles,
            [
                "Probe",
                "The Sample",
                "Die Probe",
                "Prov",
                "Prov",
                "The Sample"
            ]
        );
    }
}
