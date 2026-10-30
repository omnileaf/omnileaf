use crate::letter_case::fold_case;

pub(super) fn nearest_words(typed: &[char], title: &str) -> Option<(usize, String)> {
    closest_words(typed, &fold_case(title))
        .filter(|(slips, _)| (1..=slips_allowed(typed.len())).contains(slips))
}

const fn slips_allowed(chars: usize) -> usize {
    match chars {
        0..=4 => 1,
        5..=8 => 2,
        _ => 3,
    }
}

fn closest_words(typed: &[char], title: &str) -> Option<(usize, String)> {
    let typed_words = typed.split(|&char| char == ' ').count();
    let words: Vec<&str> = title.split(' ').collect();
    words
        .windows(typed_words.min(words.len()))
        .map(|window| {
            let window = window.join(" ");
            let chars: Vec<char> = window.chars().collect();
            (slips(typed, &chars), window)
        })
        .min_by_key(|(slips, _)| *slips)
}

fn slips(from: &[char], to: &[char]) -> usize {
    let mut before_last: Vec<usize> = Vec::new();
    let mut last: Vec<usize> = (0..=to.len()).collect();
    let mut previous_from: Option<char> = None;
    for (row, &from_char) in from.iter().enumerate() {
        let mut current = vec![row + 1];
        let mut previous_to: Option<char> = None;
        for (column, (&to_char, pair)) in to.iter().zip(last.windows(2)).enumerate() {
            let &[diagonal, above] = pair else {
                continue;
            };
            let left = current.last().copied().unwrap_or(row + 1);
            let mut fewest = (above + 1)
                .min(left + 1)
                .min(diagonal + usize::from(from_char != to_char));
            let is_swapped = previous_from == Some(to_char) && previous_to == Some(from_char);
            if is_swapped
                && let Some(&two_back) = column
                    .checked_sub(1)
                    .and_then(|before| before_last.get(before))
            {
                fewest = fewest.min(two_back + 1);
            }
            current.push(fewest);
            previous_to = Some(to_char);
        }
        before_last = std::mem::replace(&mut last, current);
        previous_from = Some(from_char);
    }
    last.last().copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slips_between(from: &str, to: &str) -> usize {
        let from: Vec<char> = from.chars().collect();
        let to: Vec<char> = to.chars().collect();
        slips(&from, &to)
    }

    #[test]
    fn counts_each_letter_added_dropped_changed_or_swapped_as_one_slip() {
        assert_eq!(
            [
                slips_between("harbour", "harbour"),
                slips_between("harbor", "harbour"),
                slips_between("harbouur", "harbour"),
                slips_between("harbiur", "harbour"),
                slips_between("harbuor", "harbour"),
            ],
            [0, 1, 1, 1, 1]
        );
    }
}
