pub(super) const TRIGRAM_CHARS: usize = 3;

pub(super) fn typed_trigrams(typed: &str) -> Vec<String> {
    let chars: Vec<char> = typed.chars().collect();
    let mut trigrams: Vec<String> = Vec::new();
    for window in chars.windows(TRIGRAM_CHARS) {
        let trigram: String = window.iter().collect();
        if !trigrams.contains(&trigram) {
            trigrams.push(trigram);
        }
    }
    trigrams
}
