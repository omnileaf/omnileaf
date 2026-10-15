use rusqlite::Connection;

use crate::{Error, letter_case::fold_case};

const TRIGRAM_CHARS: usize = 3;
const MOST_CANDIDATES: i64 = 20;

/// The titles sharing the most trigrams with the text, among series holding a book.
const CANDIDATES: &str = "SELECT series.title FROM series_fts
    JOIN series ON series.local_id = series_fts.rowid
    WHERE series_fts MATCH ?1 AND series.reading_stage IS NOT NULL
    ORDER BY series_fts.rank
    LIMIT ?2";

/// The words of a title nearest the text by a few typing slips, their letter case folded, for a search that found nothing.
#[tracing::instrument(skip_all)]
pub fn closest_title_words(connection: &Connection, text: &str) -> Result<Option<String>, Error> {
    let typed = fold_case(text);
    let Some(query) = trigram_query(&typed) else {
        return Ok(None);
    };
    let typed: Vec<char> = typed.chars().collect();
    let slips_allowed = slips_allowed(typed.len());
    let mut candidates = connection.prepare(CANDIDATES)?;
    let titles = candidates
        .query_map((query, MOST_CANDIDATES), |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(titles
        .iter()
        .filter_map(|title| closest_words(&typed, &fold_case(title)))
        .filter(|(slips, _)| (1..=slips_allowed).contains(slips))
        .min_by_key(|(slips, _)| *slips)
        .map(|(_, words)| words))
}

/// Each run of three characters typed, quoted so FTS5 reads it as itself, any one of which finds a title.
fn trigram_query(typed: &str) -> Option<String> {
    let chars: Vec<char> = typed.chars().collect();
    let mut trigrams: Vec<String> = chars
        .windows(TRIGRAM_CHARS)
        .map(|trigram| trigram.iter().collect())
        .collect();
    trigrams.sort_unstable();
    trigrams.dedup();
    (!trigrams.is_empty()).then(|| {
        trigrams
            .iter()
            .map(|trigram| format!("\"{}\"", trigram.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" OR ")
    })
}

const fn slips_allowed(chars: usize) -> usize {
    match chars {
        0..=4 => 1,
        5..=8 => 2,
        _ => 3,
    }
}

/// The run of as many words of the title as were typed that takes the fewest slips to reach, with that count.
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

/// Letters added, dropped, changed or swapped with the next, as optimal string alignment counts them.
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
    use crate::scratch::ScratchLibrary;

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

    #[test]
    fn reads_the_candidates_from_the_title_index_in_rank_order_then_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN series_fts VIRTUAL TABLE INDEX 32:M1",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
