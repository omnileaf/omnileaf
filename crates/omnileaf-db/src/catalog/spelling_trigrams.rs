const TRIGRAM_CHARS: usize = 3;

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
