use crate::{Error, letter_case::fold_case};

/// What a search finds in series titles, parsed once from the words typed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchText(pub(crate) Lookup);

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Lookup {
    /// A full-text query for titles holding every phrase, each at least as long as a trigram.
    Phrases(String),
    /// A few characters, their letter case folded, for titles holding them anywhere.
    Characters(String),
}

impl SearchText {
    pub const MAX_CHARS: u16 = 200;

    /// Absent for text with nothing but white space, which every title holds.
    pub fn parse(text: &str) -> Result<Option<Self>, Error> {
        let chars = text.chars().count();
        if chars > usize::from(Self::MAX_CHARS) {
            return Err(Error::SearchTooLong {
                chars,
                max: Self::MAX_CHARS,
            });
        }
        let words: Vec<&str> = text.split_whitespace().collect();
        if words.is_empty() {
            return Ok(None);
        }
        let joined = words.join(" ");
        let lookup = if is_shorter_than_a_trigram(&joined) {
            Lookup::Characters(fold_case(&joined))
        } else {
            Lookup::Phrases(full_text_query(&words))
        };
        Ok(Some(Self(lookup)))
    }
}

const TRIGRAM_CHARS: usize = 3;

fn is_shorter_than_a_trigram(text: &str) -> bool {
    text.chars().count() < TRIGRAM_CHARS
}

/// Starts a phrase at each word long enough to be found alone, once the phrase before it is, so every phrase holds a trigram.
fn phrases<'w>(words: &[&'w str]) -> Vec<Vec<&'w str>> {
    let mut phrases: Vec<Vec<&str>> = Vec::new();
    for &word in words {
        match phrases.last_mut() {
            Some(phrase) if is_shorter_than_a_trigram(word) || is_short(phrase) => {
                phrase.push(word);
            }
            Some(_) | None => phrases.push(vec![word]),
        }
    }
    phrases
}

fn is_short(phrase: &[&str]) -> bool {
    is_shorter_than_a_trigram(&phrase.join(" "))
}

/// Quotes each phrase, so FTS5 reads every character typed as itself.
fn full_text_query(words: &[&str]) -> String {
    phrases(words)
        .iter()
        .map(|phrase| format!("\"{}\"", phrase.join(" ").replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    fn lookup(text: &str) -> Lookup {
        SearchText::parse(text).unwrap().unwrap().0
    }

    fn phrases(text: &str) -> Lookup {
        Lookup::Phrases(text.to_owned())
    }

    fn characters(text: &str) -> Lookup {
        Lookup::Characters(text.to_owned())
    }

    #[test]
    fn looks_for_a_word_of_three_characters_or_more_as_a_phrase() {
        let found = lookup("lantern");

        assert_eq!(found, phrases(r#""lantern""#));
    }

    #[test]
    fn looks_for_every_word_of_three_characters_or_more_as_a_phrase_of_its_own() {
        let found = lookup("Sample  Series");

        assert_eq!(found, phrases(r#""Sample" "Series""#));
    }

    #[test]
    fn keeps_a_short_word_in_the_phrase_before_it() {
        let found = lookup("Series 4 Sample");

        assert_eq!(found, phrases(r#""Series 4" "Sample""#));
    }

    #[test]
    fn keeps_a_short_first_word_in_the_phrase_after_it() {
        let found = lookup("4 Series Sample");

        assert_eq!(found, phrases(r#""4 Series" "Sample""#));
    }

    #[test]
    fn looks_for_short_words_together_once_they_run_to_three_characters() {
        let found = lookup(" a  b ");

        assert_eq!(found, phrases(r#""a b""#));
    }

    #[test]
    fn looks_for_fewer_than_three_characters_anywhere_in_a_title() {
        let found = lookup(" ab ");

        assert_eq!(found, characters("ab"));
    }

    #[test]
    fn counts_characters_rather_than_bytes() {
        let found = [lookup("éé"), lookup("ééé")];

        assert_eq!(found, [characters("éé"), phrases(r#""ééé""#)]);
    }

    #[test]
    fn folds_the_letter_case_of_a_few_characters_in_any_script() {
        let found = [lookup("ÉC"), lookup("ШЕ")];

        assert_eq!(found, [characters("éc"), characters("ше")]);
    }

    #[test]
    fn finds_quotation_marks_as_themselves() {
        let found = lookup(r#"say "hi""#);

        assert_eq!(found, phrases(r#""say" """hi""""#));
    }

    #[test]
    fn looks_for_nothing_in_white_space_alone() {
        let parsed = [SearchText::parse(""), SearchText::parse(" \t\n ")];

        assert!(matches!(parsed, [Ok(None), Ok(None)]));
    }

    #[test]
    fn refuses_text_longer_than_a_search_reads() {
        let longest = usize::from(SearchText::MAX_CHARS);
        let text = "a".repeat(longest + 1);

        let parsed = SearchText::parse(&text);

        assert!(matches!(
            parsed,
            Err(Error::SearchTooLong { chars, max: SearchText::MAX_CHARS })
                if chars == longest + 1
        ));
    }

    proptest! {
        #[test]
        fn gives_every_phrase_a_trigram_and_keeps_every_word_in_order(
            words in prop::collection::vec("[a-zé0-9]{1,6}", 1..8),
        ) {
            let text = words.join("  ");

            let found = lookup(&text);

            let joined = words.join(" ");
            match found {
                Lookup::Phrases(query) => {
                    let inner = query
                        .strip_prefix('"')
                        .and_then(|rest| rest.strip_suffix('"'))
                        .unwrap();
                    let phrases: Vec<&str> = inner.split(r#"" ""#).collect();
                    prop_assert!(phrases.iter().all(|phrase| phrase.chars().count() >= 3));
                    prop_assert_eq!(phrases.join(" "), joined);
                }
                Lookup::Characters(characters) => {
                    prop_assert!(joined.chars().count() < 3);
                    prop_assert_eq!(characters, joined);
                }
            }
        }
    }
}
