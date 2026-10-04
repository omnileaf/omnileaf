use unicode_normalization::UnicodeNormalization;

/// Sorts a digit run where its first digit would, since no letter or symbol falls between the digits.
const NUMBER_MARKER: u8 = b'0';
const ZERO: char = '0';

/// Bytes ordered as natural sort orders titles (case and width ignored, digit runs by value), short of its final tie-break.
pub(crate) fn title_sort_key(title: &str) -> Vec<u8> {
    let mut key = Vec::with_capacity(title.len());
    let mut digits = String::new();
    for character in title.nfkc().flat_map(char::to_lowercase) {
        if character.is_ascii_digit() {
            digits.push(character);
            continue;
        }
        push_number(&mut key, &digits);
        digits.clear();
        let mut encoded = [0; 4];
        key.extend_from_slice(character.encode_utf8(&mut encoded).as_bytes());
    }
    push_number(&mut key, &digits);
    key
}

/// Writes the digit count before the digits and the leading zeros after, so a larger value and then more zeros sort later.
fn push_number(key: &mut Vec<u8>, digits: &str) {
    if digits.is_empty() {
        return;
    }
    let value = digits.trim_start_matches(ZERO);
    let leading_zeros = digits.len() - value.len();
    key.push(NUMBER_MARKER);
    key.extend_from_slice(&saturating_u32(value.len()).to_be_bytes());
    key.extend_from_slice(value.as_bytes());
    key.extend_from_slice(&saturating_u32(leading_zeros).to_be_bytes());
}

fn saturating_u32(length: usize) -> u32 {
    u32::try_from(length).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use std::cmp::Ordering;

    use omnileaf_formats::natural_cmp;
    use proptest::prelude::*;

    use super::*;

    const TITLE: &str = "[a-zA-Z0-9 ._ßİ０-９①Ａ-Ｚ一-三-]{0,16}";

    /// Mixes unrelated titles with ones differing only in case or in leading zeros, which random pairs almost never do.
    fn title_pairs() -> impl Strategy<Value = (String, String)> {
        prop_oneof![
            (TITLE, TITLE),
            TITLE.prop_map(|title| (title.to_uppercase(), title)),
            TITLE.prop_map(|title| (zero_padded(&title), title)),
        ]
    }

    fn zero_padded(title: &str) -> String {
        let mut padded = String::with_capacity(title.len());
        let mut follows_digit = false;
        for character in title.chars() {
            let is_digit = character.is_ascii_digit();
            if is_digit && !follows_digit {
                padded.push(ZERO);
            }
            padded.push(character);
            follows_digit = is_digit;
        }
        padded
    }

    proptest! {
        #[test]
        fn orders_titles_as_natural_sort_does((left, right) in title_pairs()) {
            let by_key = title_sort_key(&left).cmp(&title_sort_key(&right));

            let expected = if folded(&left) == folded(&right) {
                Ordering::Equal
            } else {
                natural_cmp(&left, &right)
            };
            prop_assert_eq!(by_key, expected, "{:?} and {:?}", left, right);
        }
    }

    #[test]
    fn orders_digit_runs_by_value() {
        let titles = ["Sample Series 10", "Sample Series 9", "sample series 010"];

        let mut sorted = titles;
        sorted.sort_by_key(|title| title_sort_key(title));

        assert_eq!(
            sorted,
            ["Sample Series 9", "Sample Series 10", "sample series 010"]
        );
    }

    #[test]
    fn orders_a_number_with_more_leading_zeros_after_the_same_value() {
        let titles = ["sample series 010", "Sample Series 10"];

        let mut sorted = titles;
        sorted.sort_by_key(|title| title_sort_key(title));

        assert_eq!(sorted, ["Sample Series 10", "sample series 010"]);
    }

    fn folded(title: &str) -> String {
        title.nfkc().flat_map(char::to_lowercase).collect()
    }
}
