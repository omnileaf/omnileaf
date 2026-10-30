use std::{cmp::Reverse, collections::HashSet};

use rusqlite::{Connection, ToSql};

use super::{
    fts_terms::{any_of, quoted},
    spelling_trigrams::{TRIGRAM_CHARS, typed_trigrams},
};
use crate::{Error, adult_content::AdultHiding};

const COMMON_AT: usize = 50;
const WINDOW: usize = 4 * COMMON_AT;
const MOST_PHRASES: usize = 4;
const FOUR_GRAM_TRIGRAMS: usize = 2;

pub(super) fn match_queries(
    connection: &Connection,
    matches_up_to_common: &str,
    typed: &str,
    hiding: AdultHiding,
) -> Result<Vec<String>, Error> {
    let found = trigrams_found(connection, matches_up_to_common, typed, hiding)?;
    let typed: Vec<char> = typed.chars().collect();
    let longest_runs = longest_runs_of_found(&typed, &found);
    let (whole, left_over) = split_whole_and_left_over(found);
    let four_grams = four_grams_of_left_over(&typed, &left_over);
    let queries = [any_of(&whole)]
        .into_iter()
        .chain(longest_runs.iter().map(|run| quoted(run)))
        .chain([any_of(&four_grams), any_of(&left_over)]);
    let mut distinct: Vec<String> = Vec::new();
    for query in queries.filter(|query| !query.is_empty()) {
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

fn longest_runs_of_found(typed: &[char], found: &[(usize, String)]) -> Vec<String> {
    let found: HashSet<&str> = found.iter().map(|(_, trigram)| trigram.as_str()).collect();
    let mut runs = runs_of(typed, &found);
    runs.retain(|run| run.trigrams >= FOUR_GRAM_TRIGRAMS);
    runs.sort_by_key(|run| Reverse(run.trigrams));
    runs.iter()
        .take(MOST_PHRASES)
        .filter_map(|run| phrase(typed, run.first_trigram, run.trigrams))
        .collect()
}

fn four_grams_of_left_over(typed: &[char], left_over: &[String]) -> Vec<String> {
    let left_over: HashSet<&str> = left_over.iter().map(String::as_str).collect();
    runs_of(typed, &left_over)
        .iter()
        .flat_map(|run| {
            (run.first_trigram..run.first_trigram + run.trigrams + 1 - FOUR_GRAM_TRIGRAMS)
                .filter_map(|first| phrase(typed, first, FOUR_GRAM_TRIGRAMS))
        })
        .take(MOST_PHRASES)
        .collect()
}

fn phrase(typed: &[char], first_trigram: usize, trigrams: usize) -> Option<String> {
    typed
        .get(first_trigram..first_trigram + trigrams + TRIGRAM_CHARS - 1)
        .map(|chars| chars.iter().collect())
}

struct Run {
    first_trigram: usize,
    trigrams: usize,
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
