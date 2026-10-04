use omnileaf_sync_proto::norm;
use proptest::prelude::*;

#[test]
fn folds_case() {
    assert_eq!(norm("Sample SERIES"), "sample series");
}

#[test]
fn folds_case_fully_rather_than_lowercasing() {
    assert_eq!(norm("STRASSE Straße"), "strasse strasse");
}

#[test]
fn applies_compatibility_normalisation() {
    assert_eq!(norm("Ｓａｍｐｌｅ ﬁle ①"), "sample file 1");
}

#[test]
fn composes_combining_marks() {
    assert_eq!(norm("Cafe\u{301}"), "caf\u{e9}");
}

#[test]
fn composes_marks_left_after_folding() {
    assert_eq!(norm("STRAẞ\u{301}E ᾳ\u{308}"), norm("strasśe αϊ"));
}

#[test]
fn trims_the_ends_and_collapses_whitespace_runs() {
    assert_eq!(
        norm(" \t Sample \u{3000}\u{a0}\n Series  "),
        "sample series"
    );
}

#[test]
fn turns_blank_text_into_an_empty_key() {
    assert_eq!(norm(" \u{2003}\t "), "");
}

#[test]
fn decomposes_with_the_unicode_17_tables() {
    assert_eq!(unicode_normalization::UNICODE_VERSION, (17, 0, 0));
}

#[test]
fn folds_case_with_the_unicode_17_tables() {
    assert_eq!(norm("\u{a7d2}"), "\u{a7d3}");
}

const FOLDING_AND_MARKS: &str = "[aAsSßẞİΪϋᾀ-ᾯᲀ-ᲈ\u{300}-\u{36f}\u{3099}\u{1d165} ]{0,8}";

proptest! {
    #[test]
    fn normalising_twice_changes_nothing(text in any::<String>()) {
        let once = norm(&text);

        prop_assert_eq!(norm(&once), once);
    }

    #[test]
    fn normalising_folded_letters_with_marks_twice_changes_nothing(text in FOLDING_AND_MARKS) {
        let once = norm(&text);

        prop_assert_eq!(norm(&once), once);
    }

    #[test]
    fn leaves_no_whitespace_at_the_ends_or_in_runs(text in any::<String>()) {
        let normalised = norm(&text);

        prop_assert_eq!(normalised.trim(), normalised.as_str());
        prop_assert!(!normalised.contains("  "));
        prop_assert!(normalised.chars().all(|character| character == ' ' || !character.is_whitespace()));
    }
}
