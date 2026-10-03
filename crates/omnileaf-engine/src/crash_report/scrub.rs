use std::{iter::Peekable, str::Chars};

const QUOTED_PLACEHOLDER: &str = "\"…\"";
const PATH_PLACEHOLDER: &str = "<path>";
const TRUNCATION_MARK: char = '…';
const TOKEN_OPENERS: &[char] = &['(', '[', '{', '\'', '=', '@', ','];
const URL_SCHEME_END: &str = "://";
const RAW_BYTES_PER_KEPT_BYTE: usize = 64;

/// Cleans `text` and keeps at most `limit` bytes of it, cutting before a placeholder rather than through one.
pub(crate) fn clean(text: &str, limit: usize) -> String {
    let bounded = prefix_within(text, limit.saturating_mul(RAW_BYTES_PER_KEPT_BYTE));
    shorten(&scrub(bounded), limit)
}

/// Replaces quoted text and anything path-shaped, since that is where names and titles appear in error messages.
///
/// A path or URL runs to the end of its line, because names can contain spaces.
fn scrub(text: &str) -> String {
    let mut cleaned = String::with_capacity(text.len());
    let mut rest = text.chars().peekable();
    let mut at_token_start = true;
    while let Some(next) = rest.peek().copied() {
        if next == '"' {
            skip_quoted(&mut rest);
            cleaned.push_str(QUOTED_PLACEHOLDER);
            at_token_start = false;
        } else if at_token_start && is_path(&upcoming_token(&rest)) {
            skip_line(&mut rest);
            cleaned.push_str(PATH_PLACEHOLDER);
        } else {
            rest.next();
            cleaned.push(next);
            at_token_start = next.is_whitespace() || TOKEN_OPENERS.contains(&next);
        }
    }
    cleaned
}

fn shorten(scrubbed: &str, limit: usize) -> String {
    if scrubbed.len() <= limit {
        return scrubbed.to_owned();
    }
    let kept = prefix_within(scrubbed, limit.saturating_sub(TRUNCATION_MARK.len_utf8()));
    let opens_cut_placeholder = kept.matches('"').count() % 2 == 1;
    let kept = match kept.rfind('"') {
        Some(cut_quote) if opens_cut_placeholder => kept.get(..cut_quote).unwrap_or_default(),
        _ => kept,
    };
    let mut shortened = kept.to_owned();
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

fn skip_quoted(rest: &mut Peekable<Chars<'_>>) {
    rest.next();
    while let Some(next) = rest.next() {
        match next {
            '\\' => {
                rest.next();
            }
            '"' => return,
            _ => {}
        }
    }
}

fn skip_line(rest: &mut Peekable<Chars<'_>>) {
    while rest.next_if(|next| *next != '\n').is_some() {}
}

fn upcoming_token(rest: &Peekable<Chars<'_>>) -> String {
    rest.clone()
        .take_while(|next| !next.is_whitespace())
        .collect()
}

fn is_path(token: &str) -> bool {
    let mut chars = token.chars();
    let first = chars.next();
    let second = chars.next();
    let third = chars.next();
    let is_separator = |c: Option<char>| matches!(c, Some('/' | '\\'));
    match first {
        Some('/') => second.is_some(),
        Some('\\') => true,
        Some('~') => is_separator(second),
        Some('.') => is_separator(second) || (second == Some('.') && is_separator(third)),
        Some(drive) if drive.is_ascii_alphabetic() && second == Some(':') => {
            is_separator(third) || is_url(token)
        }
        Some(letter) if letter.is_ascii_alphabetic() => is_url(token),
        _ => false,
    }
}

fn is_url(token: &str) -> bool {
    let Some((scheme, _)) = token.split_once(URL_SCHEME_END) else {
        return false;
    };
    let mut chars = scheme.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars.all(|next| next.is_ascii_alphanumeric() || matches!(next, '+' | '.' | '-'))
}
