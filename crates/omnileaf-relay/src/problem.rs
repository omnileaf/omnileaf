use std::collections::BTreeSet;

const WORRYING_LEVELS: [&str; 2] = ["WARN", "ERROR"];
const NUMBER_STAND_IN: char = '#';

pub(crate) fn fingerprint(report: &str) -> Option<[u8; 32]> {
    let worrying: BTreeSet<String> = report
        .lines()
        .filter(|line| is_worrying(line))
        .map(without_numbers)
        .collect();
    if worrying.is_empty() {
        return None;
    }
    let mut hasher = blake3::Hasher::new();
    for line in &worrying {
        hasher.update(line.as_bytes());
        hasher.update(b"\n");
    }
    Some(*hasher.finalize().as_bytes())
}

fn is_worrying(line: &str) -> bool {
    line.split_whitespace()
        .next()
        .is_some_and(|level| WORRYING_LEVELS.contains(&level))
}

fn without_numbers(line: &str) -> String {
    let mut kept = String::with_capacity(line.len());
    let mut in_number = false;
    for character in line.chars() {
        if character.is_ascii_digit() {
            if !in_number {
                kept.push(NUMBER_STAND_IN);
            }
            in_number = true;
        } else {
            in_number = false;
            kept.push(character);
        }
    }
    kept
}
