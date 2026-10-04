use std::{iter::Peekable, str::Chars};

const QUOTED_PLACEHOLDER: &str = "\"…\"";
const PATH_PLACEHOLDER: &str = "<path>";
const TRUNCATION_MARK: char = '…';
const QUOTES: &[(char, char)] = &[('"', '"'), ('`', '`'), ('“', '”'), ('‘', '’')];
const APOSTROPHE: char = '\'';
const AFTER_CLOSING_APOSTROPHE: &[char] = &['.', ',', ';', ':', '!', '?', ')', ']', '}'];
const TOKEN_OPENERS: &[char] = &['(', '[', '{', '<', APOSTROPHE, '=', '@', ',', ':'];
const SEPARATORS: [char; 2] = ['/', '\\'];
const CONTENT_EXTENSIONS: &[&str] = &[
    ".cbz", ".cbr", ".cb7", ".cbt", ".zip", ".rar", ".7z", ".epub", ".pdf", ".jpg", ".jpeg",
    ".png", ".webp", ".gif", ".avif",
];
const URL_SCHEME_END: &str = "://";
const RAW_BYTES_PER_KEPT_BYTE: usize = 64;

/// Cleans `text` and keeps at most `limit` bytes of it, cutting before a placeholder rather than through one.
pub(crate) fn clean(text: &str, limit: usize) -> String {
    let bounded = prefix_within(text, limit.saturating_mul(RAW_BYTES_PER_KEPT_BYTE));
    shorten(&scrub(bounded), limit)
}

/// Keeps at most `limit` bytes of text that needs no cleaning.
pub(crate) fn bound(text: &str, limit: usize) -> String {
    shorten(text, limit)
}

/// Replaces quoted text and anything path-shaped, since that is where names and titles appear in error messages.
///
/// A path or URL runs to the end of its line, because names can contain spaces.
fn scrub(text: &str) -> String {
    let mut cleaned = String::with_capacity(text.len());
    let mut rest = text.chars().peekable();
    let mut paths = LinePaths::default();
    let mut at_token_start = true;
    while let Some(next) = rest.peek().copied() {
        if skip_quoted(&mut rest, at_token_start) {
            cleaned.push_str(QUOTED_PLACEHOLDER);
            paths = LinePaths::default();
            at_token_start = true;
        } else if at_token_start && paths.starts_path(&rest) {
            skip_line(&mut rest);
            cleaned.push_str(PATH_PLACEHOLDER);
        } else {
            rest.next();
            cleaned.push(next);
            paths.pass(next);
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

/// Skips a quoted span starting at `rest`, returning whether there was one.
fn skip_quoted(rest: &mut Peekable<Chars<'_>>, at_token_start: bool) -> bool {
    let Some(open) = rest.peek().copied() else {
        return false;
    };
    if let Some(close) = closing_quote(open) {
        rest.next();
        skip_through(rest, close);
        return true;
    }
    if open != APOSTROPHE || !at_token_start {
        return false;
    }
    let Some(length) = single_quoted_length(rest) else {
        return false;
    };
    rest.by_ref().take(length).for_each(drop);
    true
}

fn closing_quote(open: char) -> Option<char> {
    QUOTES
        .iter()
        .find_map(|(quote_open, close)| (*quote_open == open).then_some(*close))
}

fn skip_through(rest: &mut Peekable<Chars<'_>>, close: char) {
    while let Some(next) = rest.next() {
        if next == '\\' {
            rest.next();
        } else if next == close {
            return;
        }
    }
}

/// The length of a single-quoted span on one line with no other quotes inside, closed by a quote that ends a word.
fn single_quoted_length(rest: &Peekable<Chars<'_>>) -> Option<usize> {
    let mut chars = rest.clone().skip(1).peekable();
    let mut length = 1_usize;
    while let Some(next) = chars.next() {
        length = length.saturating_add(1);
        match next {
            '\n' => return None,
            quote if closing_quote(quote).is_some() => return None,
            APOSTROPHE if chars.peek().is_none_or(|after| closes_apostrophe(*after)) => {
                return Some(length);
            }
            _ => {}
        }
    }
    None
}

fn closes_apostrophe(after: char) -> bool {
    after.is_whitespace()
        || AFTER_CLOSING_APOSTROPHE.contains(&after)
        || closing_quote(after).is_some()
}

fn skip_line(rest: &mut Peekable<Chars<'_>>) {
    while rest.next_if(|next| *next != '\n').is_some() {}
}

/// Recognises paths on one line, remembering once the rest of the line names no content file so each line is read once.
#[derive(Default)]
struct LinePaths {
    names_no_content_file: bool,
}

impl LinePaths {
    fn pass(&mut self, next: char) {
        if next == '\n' {
            self.names_no_content_file = false;
        }
    }

    fn starts_path(&mut self, rest: &Peekable<Chars<'_>>) -> bool {
        let token: String = rest
            .clone()
            .take_while(|next| !next.is_whitespace())
            .collect();
        if is_rooted_path(&token) {
            return true;
        }
        let relative = token
            .split(|next| TOKEN_OPENERS.contains(&next) || closing_quote(next).is_some())
            .next()
            .unwrap_or_default();
        if !relative.starts_with(char::is_alphanumeric) {
            return false;
        }
        match relative.matches(SEPARATORS).count() {
            0 => false,
            1 => self.line_names_content_file(rest),
            _ => true,
        }
    }

    fn line_names_content_file(&mut self, rest: &Peekable<Chars<'_>>) -> bool {
        if self.names_no_content_file {
            return false;
        }
        let line = rest
            .clone()
            .take_while(|next| *next != '\n')
            .collect::<String>()
            .to_lowercase();
        let names_content_file = CONTENT_EXTENSIONS
            .iter()
            .any(|extension| line.contains(extension));
        self.names_no_content_file = !names_content_file;
        names_content_file
    }
}

fn is_rooted_path(token: &str) -> bool {
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
