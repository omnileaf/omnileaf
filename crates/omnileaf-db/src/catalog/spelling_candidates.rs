use std::collections::HashSet;

use rusqlite::{Connection, ToSql};

use super::spelling_trigrams::{TRIGRAM_CHARS, any_of, quoted, typed_trigrams};
use crate::{Error, adult_content::AdultHiding};

const COMMON_AT: usize = 50;
const WINDOW: usize = 4 * COMMON_AT;
const MOST_PHRASES: usize = 4;
const FOUR_GRAM_TRIGRAMS: usize = 2;

struct Run {
    first_trigram: usize,
    trigrams: usize,
}

impl Run {
    fn phrase(&self, typed: &[char]) -> Option<String> {
        phrase(typed, self.first_trigram, self.trigrams)
    }

    fn four_grams(&self, typed: &[char]) -> Vec<String> {
        (self.first_trigram..self.first_trigram + self.trigrams + 1 - FOUR_GRAM_TRIGRAMS)
            .filter_map(|first| phrase(typed, first, FOUR_GRAM_TRIGRAMS))
            .collect()
    }
}

fn phrase(typed: &[char], first_trigram: usize, trigrams: usize) -> Option<String> {
    typed
        .get(first_trigram..first_trigram + trigrams + TRIGRAM_CHARS - 1)
        .map(|chars| chars.iter().collect())
}

pub(super) fn match_queries(
    connection: &Connection,
    matches_up_to_common: &str,
    typed: &str,
    hiding: AdultHiding,
) -> Result<Vec<String>, Error> {
    let found = trigrams_found(connection, matches_up_to_common, typed, hiding)?;
    let typed: Vec<char> = typed.chars().collect();
    let found_runs = runs_of(
        &typed,
        &found.iter().map(|(_, trigram)| trigram.as_str()).collect(),
    );
    let (whole, left_over) = split_whole_and_left_over(found);
    let left_over_runs = runs_of(&typed, &left_over.iter().map(String::as_str).collect());
    let mut found_runs: Vec<Run> = found_runs
        .into_iter()
        .filter(|run| run.trigrams >= FOUR_GRAM_TRIGRAMS)
        .collect();
    found_runs.sort_by_key(|run| std::cmp::Reverse(run.trigrams));
    let mut queries: Vec<String> = vec![any_of(&whole)];
    queries.extend(
        found_runs
            .iter()
            .take(MOST_PHRASES)
            .filter_map(|run| run.phrase(&typed))
            .map(|phrase| quoted(&phrase)),
    );
    let four_grams: Vec<String> = left_over_runs
        .iter()
        .flat_map(|run| run.four_grams(&typed))
        .take(MOST_PHRASES)
        .collect();
    queries.push(any_of(&four_grams));
    queries.push(any_of(&left_over));
    let mut distinct: Vec<String> = Vec::new();
    for query in queries.into_iter().filter(|query| !query.is_empty()) {
        if !distinct.contains(&query) {
            distinct.push(query);
        }
    }
    Ok(distinct)
}

pub(super) fn read_window<T>(
    queries: &[String],
    mut read: impl FnMut(&str, usize) -> Result<Vec<T>, Error>,
) -> Result<Vec<T>, Error> {
    let mut rows = Vec::new();
    for query in queries {
        let room = WINDOW - rows.len();
        if room == 0 {
            break;
        }
        rows.extend(read(query, room)?);
    }
    Ok(rows)
}

fn trigrams_found(
    connection: &Connection,
    matches_up_to_common: &str,
    typed: &str,
    hiding: AdultHiding,
) -> Result<Vec<(usize, String)>, Error> {
    let mut probe = connection.prepare(matches_up_to_common)?;
    let [leaves_out, counts] = hiding.params();
    let mut found = Vec::new();
    for trigram in typed_trigrams(typed) {
        let matches: usize = probe.query_row(
            &[
                (":query", &quoted(&trigram) as &dyn ToSql),
                (":limit", &COMMON_AT),
                leaves_out,
                counts,
            ][..],
            |row| row.get(0),
        )?;
        if matches > 0 {
            found.push((matches, trigram));
        }
    }
    Ok(found)
}

fn split_whole_and_left_over(mut found: Vec<(usize, String)>) -> (Vec<String>, Vec<String>) {
    found.sort_by_key(|(matches, _)| *matches);
    let mut read_so_far = 0;
    let (whole, left_over): (Vec<_>, Vec<_>) = found.into_iter().partition(|(matches, _)| {
        read_so_far += matches;
        *matches < COMMON_AT && read_so_far <= WINDOW
    });
    (
        whole.into_iter().map(|(_, trigram)| trigram).collect(),
        left_over.into_iter().map(|(_, trigram)| trigram).collect(),
    )
}

fn runs_of(typed: &[char], trigrams: &HashSet<&str>) -> Vec<Run> {
    let mut runs: Vec<Run> = Vec::new();
    let mut is_in_run = false;
    for (first_trigram, window) in typed.windows(TRIGRAM_CHARS).enumerate() {
        let trigram: String = window.iter().collect();
        if !trigrams.contains(trigram.as_str()) {
            is_in_run = false;
            continue;
        }
        match runs.last_mut() {
            Some(run) if is_in_run => run.trigrams += 1,
            _ => runs.push(Run {
                first_trigram,
                trigrams: 1,
            }),
        }
        is_in_run = true;
    }
    runs
}
