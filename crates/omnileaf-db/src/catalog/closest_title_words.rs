use rusqlite::{Connection, ToSql};

use super::rarest_trigrams::{WINDOW, rarest_trigrams};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

const TRIGRAM_CHARS: usize = 3;

macro_rules! titles_of_shown_series_matching {
    () => {
        concat!(
            "series_fts
            JOIN series ON series.local_id = series_fts.rowid
            WHERE series_fts MATCH :query AND series.reading_stage IS NOT NULL AND NOT ",
            crate::adult_content::in_hidden_adult_series!("series")
        )
    };
}

const MATCHES_UP_TO_COMMON: &str = concat!(
    "SELECT count(*) FROM (SELECT 1 FROM ",
    titles_of_shown_series_matching!(),
    " LIMIT :limit)"
);

const CANDIDATES: &str = concat!(
    "SELECT series.title FROM ",
    titles_of_shown_series_matching!(),
    " LIMIT :limit"
);

/// The words of a title nearest the text by a few typing slips, their letter case folded, for a search that found nothing.
#[tracing::instrument(skip_all)]
pub fn closest_title_words(
    connection: &Connection,
    text: &str,
    hiding: AdultHiding,
) -> Result<Option<String>, Error> {
    let typed = fold_case(text);
    let trigrams = rarest_trigrams(
        connection,
        MATCHES_UP_TO_COMMON,
        &typed_trigrams(&typed),
        hiding,
    )?;
    if trigrams.is_empty() {
        return Ok(None);
    }
    let typed: Vec<char> = typed.chars().collect();
    let [leaves_out, counts] = hiding.params();
    let query = any_trigram(&trigrams);
    let titles = connection
        .prepare(CANDIDATES)?
        .query_map(
            &[
                (":query", &query as &dyn ToSql),
                (":limit", &WINDOW),
                leaves_out,
                counts,
            ][..],
            |row| row.get::<_, String>(0),
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(titles
        .iter()
        .filter_map(|title| nearest_words(&typed, title))
        .min_by_key(|(slips, _)| *slips)
        .map(|(_, words)| words))
}

pub(super) fn typed_trigrams(typed: &str) -> Vec<String> {
    let chars: Vec<char> = typed.chars().collect();
    let mut trigrams: Vec<String> = chars
        .windows(TRIGRAM_CHARS)
        .map(|trigram| trigram.iter().collect())
        .collect();
    trigrams.sort_unstable();
    trigrams.dedup();
    trigrams
}

pub(super) fn quoted(trigram: &str) -> String {
    format!("\"{}\"", trigram.replace('"', "\"\""))
}

pub(super) fn any_trigram(trigrams: &[String]) -> String {
    trigrams
        .iter()
        .map(|trigram| quoted(trigram))
        .collect::<Vec<_>>()
        .join(" OR ")
}

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
    fn reads_the_candidates_from_the_title_index_unranked_then_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn probes_a_trigram_through_the_title_index_and_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-probe-plan");

        let plan = scratch.query_plan(MATCHES_UP_TO_COMMON);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-1)",
                "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SCAN (subquery-1)",
            ]
        );
    }
}
