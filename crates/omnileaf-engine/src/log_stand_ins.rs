use std::{cmp::Reverse, collections::HashMap};

use crate::{SeriesId, crash_report::scrub};

const LINE_BYTE_LIMIT: usize = 1_000;
const STAND_IN_NUMBERS: u32 = 999;
const FNV_OFFSET_BASIS: u32 = 0x811c_9dc5;
const FNV_PRIME: u32 = 0x0100_0193;

#[derive(Clone, Debug, Default)]
pub struct LogStandIns {
    by_first_word: HashMap<String, Vec<NameStandIn>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CleanedLog(Vec<String>);

impl CleanedLog {
    #[must_use]
    pub fn lines(&self) -> &[String] {
        &self.0
    }
}

#[derive(Clone, Debug)]
struct NameStandIn {
    name: String,
    stand_in: String,
}

impl LogStandIns {
    #[must_use]
    pub fn new(
        series: impl IntoIterator<Item = (SeriesId, String)>,
        folders: impl IntoIterator<Item = String>,
    ) -> Self {
        let series = series.into_iter().map(|(id, title)| NameStandIn {
            stand_in: format!("Series {:02}", stand_in_number(&id.to_string())),
            name: title,
        });
        let folders = folders.into_iter().map(|name| NameStandIn {
            stand_in: format!("Folder {:02}", stand_in_number(&name)),
            name,
        });
        let mut by_first_word: HashMap<String, Vec<NameStandIn>> = HashMap::new();
        for named in series.chain(folders) {
            let name = named
                .name
                .trim_matches(|next: char| !next.is_alphanumeric());
            if name.is_empty() {
                continue;
            }
            by_first_word
                .entry(first_word(name).to_owned())
                .or_default()
                .push(NameStandIn {
                    name: name.to_owned(),
                    stand_in: named.stand_in,
                });
        }
        for names in by_first_word.values_mut() {
            names.sort_by_key(|named| Reverse(named.name.len()));
        }
        Self { by_first_word }
    }

    #[must_use]
    pub fn clean(&self, line: &str) -> String {
        scrub::clean(&self.replace_names(line), LINE_BYTE_LIMIT)
    }

    #[must_use]
    pub fn clean_log(&self, lines: &[String]) -> CleanedLog {
        CleanedLog(lines.iter().map(|line| self.clean(line)).collect())
    }

    fn replace_names(&self, line: &str) -> String {
        let mut replaced = String::with_capacity(line.len());
        let mut rest = line;
        while let Some(start) = rest.find(char::is_alphanumeric) {
            let (before, from_word) = rest.split_at(start);
            replaced.push_str(before);
            let word = first_word(from_word);
            let (kept, length) = match self.name_at(from_word, word) {
                Some(named) => (named.stand_in.as_str(), named.name.len()),
                None => (word, word.len()),
            };
            replaced.push_str(kept);
            rest = from_word.get(length..).unwrap_or_default();
        }
        replaced.push_str(rest);
        replaced
    }

    fn name_at(&self, text: &str, word: &str) -> Option<&NameStandIn> {
        self.by_first_word.get(word)?.iter().find(|named| {
            text.strip_prefix(named.name.as_str())
                .is_some_and(|after| !after.starts_with(char::is_alphanumeric))
        })
    }
}

fn first_word(text: &str) -> &str {
    let end = text
        .find(|next: char| !next.is_alphanumeric())
        .unwrap_or(text.len());
    text.get(..end).unwrap_or_default()
}

/// The number Screenshot mode's interface draws from a name, by 32-bit FNV-1a over its UTF-16 code units as JavaScript strings hold them.
fn stand_in_number(name: &str) -> u32 {
    let hash = name.encode_utf16().fold(FNV_OFFSET_BASIS, |hash, unit| {
        (hash ^ u32::from(unit)).wrapping_mul(FNV_PRIME)
    });
    hash % STAND_IN_NUMBERS + 1
}
