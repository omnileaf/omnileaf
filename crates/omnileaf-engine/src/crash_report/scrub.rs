const TRUNCATION_MARK: char = '…';

/// Keeps at most `limit` bytes of `text`, marking a cut with an ellipsis that counts towards the limit.
pub(super) fn bound(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_owned();
    }
    let mut shortened =
        prefix_within(text, limit.saturating_sub(TRUNCATION_MARK.len_utf8())).to_owned();
    shortened.push(TRUNCATION_MARK);
    shortened
}

fn prefix_within(text: &str, budget: usize) -> &str {
    let cut = text
        .char_indices()
        .map(|(start, next)| start.saturating_add(next.len_utf8()))
        .take_while(|end| *end <= budget)
        .last()
        .unwrap_or(0);
    text.get(..cut).unwrap_or_default()
}
