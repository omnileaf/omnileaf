use super::{
    number::{Found, Number, NumberRange},
    title::squeezed,
};

pub(super) fn read_bare_number(title: &str, series_title: Option<&str>) -> Option<NumberRange> {
    let start = series_title
        .and_then(|series_title| end_of_series_title(title, series_title))
        .unwrap_or(0);
    (start..title.len()).find_map(|at| {
        let first = standalone_number(title, at)?;
        let range = NumberRange::read_after(title, first, |last| standalone_number(title, last));
        Some(range.value)
    })
}

pub(super) fn end_of_series_title(title: &str, series_title: &str) -> Option<usize> {
    let mut title_chars = title.char_indices();
    let mut end = 0;
    for series_char in squeezed(series_title.chars()) {
        let (at, title_char) = title_chars.next()?;
        if !series_char.to_lowercase().eq(title_char.to_lowercase()) {
            return None;
        }
        end = at + title_char.len_utf8();
    }
    let at_word_boundary = !is_letter_or_digit(char_at(title, end));
    (end > 0 && at_word_boundary).then_some(end)
}

fn standalone_number(title: &str, at: usize) -> Option<Found<Number>> {
    let char_before = title.get(..at)?.chars().next_back();
    if is_letter_or_digit(char_before) {
        return None;
    }
    Number::read(title, at).filter(|number| !is_letter_or_digit(char_at(title, number.end)))
}

fn char_at(title: &str, at: usize) -> Option<char> {
    title.get(at..)?.chars().next()
}

fn is_letter_or_digit(character: Option<char>) -> bool {
    character.is_some_and(char::is_alphanumeric)
}
