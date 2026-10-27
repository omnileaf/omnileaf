use omnileaf_formats::{Number, NumberRange, read_book_name};
use proptest::prelude::*;

fn title_of(name: &str) -> String {
    read_book_name(name, None).title
}

#[test]
fn prints_a_number_as_its_shortest_decimal() {
    let printed: Vec<String> = [12_500, 3_000, 250, 1, 50, 0]
        .map(|thousandths| Number::from_thousandths(thousandths).to_string())
        .into();

    assert_eq!(printed, ["12.5", "3", "0.25", "0.001", "0.05", "0"]);
}

#[test]
fn builds_a_range_only_when_its_last_number_is_not_below_its_first() {
    let one = Number::from_thousandths(1_000);
    let three = Number::from_thousandths(3_000);

    let ranges = [
        NumberRange::new(one, three),
        NumberRange::new(three, three),
        NumberRange::new(three, one),
    ];

    assert_eq!(
        ranges.map(|range| range.map(|range| (range.first(), range.last()))),
        [Some((one, three)), Some((three, three)), None]
    );
}

#[test]
fn leaves_every_tag_out_of_the_title() {
    let title = title_of("[GroupName] Sample Series 04 (Digital) [EN]");

    assert_eq!(title, "Sample Series 04");
}

#[test]
fn reads_underscores_as_spaces_and_collapses_whitespace() {
    let title = title_of("  Sample__Series_04 \t Extras ");

    assert_eq!(title, "Sample Series 04 Extras");
}

#[test]
fn reads_a_tag_inside_a_word_as_a_space() {
    let title = title_of("Sample[GroupName]Series");

    assert_eq!(title, "Sample Series");
}

#[test]
fn keeps_an_unmatched_bracket_as_text() {
    let titles = [
        "Sample (Series 04",
        "Sample Series] 04",
        "(Digital) Sample (Series",
        "Sample [Series (04]",
    ]
    .map(title_of);

    assert_eq!(
        titles,
        [
            "Sample (Series 04",
            "Sample Series] 04",
            "Sample (Series",
            "Sample"
        ]
    );
}

#[test]
fn keeps_the_text_of_a_name_that_is_only_tags() {
    let title = title_of("[GroupName] (Digital)");

    assert_eq!(title, "GroupName Digital");
}

fn language_of(name: &str) -> Option<String> {
    read_book_name(name, None)
        .language
        .map(|language| language.to_string())
}

#[test]
fn reads_the_language_from_a_language_code_tag() {
    let languages = [
        "Sample Series 04 [EN]",
        "Sample Series 04 (ja)",
        "Sample Series 04 [pt-br]",
        "Sample Series 04 [ es-419 ]",
    ]
    .map(language_of);

    assert_eq!(
        languages.each_ref().map(Option::as_deref),
        [Some("en"), Some("ja"), Some("pt-BR"), Some("es-419")]
    );
}

#[test]
fn takes_the_language_from_the_first_language_code_tag() {
    let language = language_of("[GroupName] Sample Series 04 (Digital) [FR] [EN]");

    assert_eq!(language.as_deref(), Some("fr"));
}

#[test]
fn reads_no_language_from_tags_that_are_not_language_codes() {
    let languages = [
        "Sample Series 04 [GroupName] (Digital)",
        "Sample Series 04 [xx]",
        "Sample Series 04 [en-B]",
        "Sample Series 04 [en-41]",
        "Sample Series 04 [en-BR-x]",
        "Sample Series 04 [eng]",
        "Sample Series 04 EN",
    ]
    .map(language_of);

    assert_eq!(languages, [None, None, None, None, None, None, None]);
}

fn tag() -> impl Strategy<Value = String> {
    ("[A-Za-z0-9 ._-]{0,8}", any::<bool>()).prop_map(|(text, square)| {
        if square {
            format!("[{text}]")
        } else {
            format!("({text})")
        }
    })
}

proptest! {
    #[test]
    fn adding_a_tag_never_changes_the_title(
        words in prop::collection::vec("[A-Za-z0-9.~-]{1,6}", 1..6),
        tag in tag(),
        at in any::<prop::sample::Index>(),
    ) {
        let name = words.join(" ");
        let mut tagged_words = words.clone();
        tagged_words.insert(at.index(words.len() + 1), tag);

        let tagged = read_book_name(&tagged_words.join(" "), None);

        prop_assert_eq!(tagged.title, title_of(&name));
    }
}
