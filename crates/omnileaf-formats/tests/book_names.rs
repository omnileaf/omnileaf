#![expect(
    clippy::unwrap_used,
    reason = "the expected numbers are written in the tests, so a bad one should stop the test"
)]

use omnileaf_formats::{Number, NumberRange, SeriesName, read_book_name, read_series_name};
use proptest::prelude::*;

fn title_of(name: &str) -> String {
    read_book_name(name, None).title
}

fn range(first: &str, last: &str) -> Option<NumberRange> {
    NumberRange::new(number(first), number(last))
}

fn single(value: &str) -> Option<NumberRange> {
    range(value, value)
}

fn number(value: &str) -> Number {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    let fraction = format!("{fraction:0<3}");
    Number::from_thousandths(
        whole.parse::<u32>().unwrap() * 1_000 + fraction.parse::<u32>().unwrap(),
    )
}

fn volume_of(name: &str) -> Option<NumberRange> {
    read_book_name(name, None).volume
}

fn chapter_of(name: &str) -> Option<NumberRange> {
    read_book_name(name, None).chapter
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

#[test]
fn reads_a_year_in_brackets_on_a_series_folder_as_its_year() {
    let series = read_series_name("Sample Series 04 (2019)");

    assert_eq!(
        series,
        SeriesName {
            title: "Sample Series 04".to_owned(),
            year: Some(2019),
        }
    );
}

#[test]
fn takes_the_year_from_the_first_tag_that_is_a_year() {
    let series = read_series_name("Sample Series 04 [GroupName] [1987] (2019)");

    assert_eq!(series.year, Some(1987));
}

#[test]
fn reads_a_year_only_from_1900_to_2099_written_with_four_digits() {
    let years = [
        "Sample Series 04 (1900)",
        "Sample Series 04 (2099)",
        "Sample Series 04 (1899)",
        "Sample Series 04 (2100)",
        "Sample Series 04 (02019)",
        "Sample Series 04 ( 2019 )",
        "Sample Series 04 (2019a)",
        "Sample Series 04 2019",
    ]
    .map(|name| read_series_name(name).year);

    assert_eq!(
        years,
        [Some(1900), Some(2099), None, None, None, None, None, None]
    );
}

#[test]
fn reads_a_series_title_like_a_book_title() {
    let series = read_series_name("[GroupName]_Sample__Series 04 (Digital)");

    assert_eq!(series.title, "Sample Series 04");
}

#[test]
fn reads_each_way_of_writing_a_volume() {
    let volumes = [
        "Sample Series 04 v01",
        "Sample Series 04 Vol. 01",
        "Sample Series 04 Volume 1",
        "Sample Series 04 vol1",
        "Sample Series 04 VOLS 1",
        "Sample Series 04 Volumes.1",
        "Sample Series 04 v.1",
        "Sample Series 04 v. 1",
        "Sample Series 04 V001",
    ]
    .map(volume_of);

    assert_eq!(volumes, [single("1"); 9]);
}

#[test]
fn reads_each_way_of_writing_a_chapter() {
    let chapters = [
        "Sample Series 04 c012",
        "Sample Series 04 Ch. 12",
        "Sample Series 04 Chapter 12",
        "Sample Series 04 ch12",
        "Sample Series 04 CHS 12",
        "Sample Series 04 Chapters.12",
        "Sample Series 04 C12",
    ]
    .map(chapter_of);

    assert_eq!(chapters, [single("12"); 7]);
}

#[test]
fn needs_a_lone_v_or_c_to_touch_its_number() {
    let names = [
        "Sample Series 04 v 01",
        "Sample Series 04 c 12",
        "Sample Series 04 c.12",
        "Sample Series 04 c. 12",
    ];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(markers, [(None, None); 4]);
}

#[test]
fn reads_a_marker_only_at_the_start_of_a_word() {
    let names = ["Sample Interv01", "Sample Arc12", "Sample Archapter 3"];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(markers, [(None, None); 3]);
}

#[test]
fn reads_a_marker_after_a_digit_or_a_symbol() {
    let volumes = ["Sample Series 04 #v2", "2v3", "Sample-v4"].map(volume_of);

    assert_eq!(volumes, [single("2"), single("3"), single("4")]);
}

#[test]
fn reads_no_marker_whose_number_runs_into_a_letter() {
    let names = ["Sample Series 04 v2x", "Sample Series 04 c12b"];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(markers, [(None, None); 2]);
}

#[test]
fn reads_a_chapter_inside_a_volume() {
    let book = read_book_name("Sample Series 04 v03 c017", None);

    assert_eq!((book.volume, book.chapter), (single("3"), single("17")));
}

#[test]
fn reads_a_chapter_written_straight_after_its_volume() {
    let names = [
        "Sample Series 04 v01c002",
        "Sample Series 04 Vol01Ch001",
        "Sample Series 04 v01-03c002",
    ];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(
        markers,
        [
            (single("1"), single("2")),
            (single("1"), single("1")),
            (range("1", "3"), single("2"))
        ]
    );
}

#[test]
fn reads_no_marker_from_markers_written_together_that_run_into_a_letter() {
    let names = ["Sample Series 04 v2c3x", "Sample Series 04 v2ch"];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(markers, [(None, None); 2]);
}

#[test]
fn counts_only_the_first_marker_of_each_kind() {
    let book = read_book_name("Sample Series 04 c017 v03 v04 c018", None);

    assert_eq!((book.volume, book.chapter), (single("3"), single("17")));
}

#[test]
fn reads_a_decimal_number() {
    let chapters = [
        "Sample Series 04 c012.5",
        "Sample Series 04 c12.25",
        "Sample Series 04 c12.x",
    ]
    .map(chapter_of);

    assert_eq!(chapters, [single("12.5"), single("12.25"), single("12")]);
}

#[test]
fn reads_a_decimal_volume() {
    let volumes = ["Sample Series 04 v01.5", "Sample Series 04 Vol. 2.25"].map(volume_of);

    assert_eq!(volumes, [single("1.5"), single("2.25")]);
}

#[test]
fn sorts_a_decimal_chapter_between_its_neighbours() {
    let chapters = ["c012", "c012.5", "c013"].map(|name| chapter_of(name).unwrap().first());

    assert!(chapters[0] < chapters[1] && chapters[1] < chapters[2]);
}

#[test]
fn keeps_three_decimal_digits_and_drops_the_rest() {
    let chapter = chapter_of("Sample Series 04 c1.23456");

    assert_eq!(chapter, single("1.234"));
}

#[test]
fn saturates_a_number_too_large_to_hold() {
    let chapter = chapter_of("Sample Series 04 c99999999999");

    assert_eq!(
        chapter.map(NumberRange::first),
        Some(Number::from_thousandths(u32::MAX))
    );
}

#[test]
fn reads_a_range_after_a_marker() {
    let volumes = [
        "Sample Series 04 v01-03",
        "Sample Series 04 v01 - 03",
        "Sample Series 04 v01\u{2013}03",
        "Sample Series 04 v01~03",
        "Sample Series 04 v01-v03",
        "Sample Series 04 Vol. 1 - Vol. 3",
    ]
    .map(volume_of);

    assert_eq!(volumes, [range("1", "3"); 6]);
}

#[test]
fn reads_a_chapter_range() {
    let chapter = chapter_of("Sample Series 04 c001.5-c003");

    assert_eq!(chapter, range("1.5", "3"));
}

#[test]
fn reads_a_backwards_range_as_its_first_number() {
    let volume = volume_of("Sample Series 04 v03-01");

    assert_eq!(volume, single("3"));
}

#[test]
fn never_reads_a_number_from_a_tag() {
    let names = [
        "Sample Series 04 [v01] (c012)",
        "[v01] (c012)",
        "Sample Series 04 v01 [-03]",
    ];

    let markers = names.map(|name| {
        let book = read_book_name(name, None);
        (book.volume, book.chapter)
    });

    assert_eq!(markers, [(None, None), (None, None), (single("1"), None)]);
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

fn name_word() -> impl Strategy<Value = String> {
    prop_oneof![
        "[A-Za-z0-9.~-]{1,6}",
        "(v|Vol\\.|c|Ch\\.)[0-9]{1,3}(\\.[0-9])?",
        "[0-9]{1,3}",
        Just("-".to_owned()),
    ]
}

fn decimal() -> impl Strategy<Value = String> {
    (0u32..1_000_000, prop::option::of("[0-9]{1,3}")).prop_map(|(whole, fraction)| match fraction {
        Some(fraction) => format!("{whole}.{fraction}"),
        None => whole.to_string(),
    })
}

fn marker() -> impl Strategy<Value = &'static str> {
    prop_oneof![Just("v"), Just("Vol. "), Just("c"), Just("Chapter ")]
}

proptest! {
    #[test]
    fn adding_a_tag_never_changes_the_title_or_the_numbers(
        words in prop::collection::vec(name_word(), 1..6),
        tag in tag(),
        at in any::<prop::sample::Index>(),
    ) {
        let mut tagged_words = words.clone();
        tagged_words.insert(at.index(words.len() + 1), tag);

        let plain = read_book_name(&words.join(" "), None);
        let tagged = read_book_name(&tagged_words.join(" "), None);

        prop_assert_eq!(
            (tagged.title, tagged.volume, tagged.chapter),
            (plain.title, plain.volume, plain.chapter)
        );
    }

    #[test]
    fn leading_zeros_never_change_a_number(
        marker in marker(),
        digits in decimal(),
        zeros in 1..4usize,
    ) {
        let padded_digits = format!("{}{digits}", "0".repeat(zeros));

        let plain = read_book_name(&format!("Sample Series 04 {marker}{digits}"), None);
        let padded = read_book_name(&format!("Sample Series 04 {marker}{padded_digits}"), None);

        prop_assert!(plain.volume.or(plain.chapter).is_some());
        prop_assert_eq!((padded.volume, padded.chapter), (plain.volume, plain.chapter));
    }

    #[test]
    fn number_order_matches_decimal_order(left in decimal(), right in decimal()) {
        let read = |digits: &str| chapter_of(&format!("c{digits}")).unwrap().first();
        let value = |digits: &str| digits.parse::<f64>().unwrap();

        let order = read(&left).cmp(&read(&right));

        prop_assert_eq!(Some(order), value(&left).partial_cmp(&value(&right)));
    }
}
