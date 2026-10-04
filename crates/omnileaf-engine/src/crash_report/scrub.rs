use std::{iter::Peekable, str::Chars};

const QUOTED_PLACEHOLDER: &str = "\"…\"";
const PATH_PLACEHOLDER: &str = "<path>";
const TRUNCATION_MARK: char = '…';
const QUOTES: &[(char, char)] = &[('"', '"'), ('`', '`'), ('“', '”'), ('‘', '’')];
const APOSTROPHE: char = '\'';
const AFTER_CLOSING_APOSTROPHE: &[char] = &['.', ',', ';', ':', '!', '?', ')', ']', '}'];
const CODE_QUOTE: char = '`';
const CODE_PUNCTUATION: &[char] = &['_', ':', '<', '>', '(', ')', '&'];
const STANDARD_VARIANTS: &[&str] = &["None", "Some", "Ok", "Err"];
const WORD_RUN_BREAKS: &[char] = &['(', '[', '{', '<', '=', '@', ',', ':', CODE_QUOTE];
pub(super) const SEPARATORS: [char; 2] = ['/', '\\'];
const CONTENT_EXTENSIONS: &[&str] = &[
    ".cbz", ".cbr", ".cb7", ".cbt", ".zip", ".rar", ".7z", ".epub", ".pdf", ".jpg", ".jpeg",
    ".png", ".webp", ".gif", ".avif",
];
const URL_SCHEME_END: &str = "://";
const RAW_BYTES_PER_KEPT_BYTE: usize = 64;

/// Cleans `text` and keeps at most `limit` bytes of it, cutting before a placeholder rather than through one.
pub(crate) fn clean(text: &str, limit: usize) -> String {
    let bounded = prefix_within(text, limit.saturating_mul(RAW_BYTES_PER_KEPT_BYTE));
    bound(&scrub(bounded), limit)
}

/// Replaces quoted text and anything path-shaped, since that is where names and titles appear in error messages.
///
/// A path runs to the end of its line, because names can contain spaces, and one that isn't rooted also takes the words before it.
fn scrub(text: &str) -> String {
    let mut cleaned = Cleaned::with_capacity(text.len());
    let mut rest = text.chars().peekable();
    let mut at_token_start = true;
    while let Some(next) = rest.peek().copied() {
        if let Some(length) = code_span_length(&rest) {
            rest.by_ref()
                .take(length)
                .for_each(|code| cleaned.push(code));
            at_token_start = true;
        } else if skip_quoted(&mut rest, at_token_start) {
            cleaned.push_quoted();
            at_token_start = true;
        } else if let Some(start) = at_token_start.then(|| path_at(&rest)).flatten() {
            skip_line(&mut rest);
            cleaned.push_path(start);
        } else {
            rest.next();
            cleaned.push(next);
            at_token_start = next.is_whitespace() || is_token_opener(next);
        }
    }
    cleaned.text
}

/// Text cleaned so far, remembering where its current run of words began, since a relative path can begin with any of them.
struct Cleaned {
    text: String,
    words_start: Option<usize>,
}

impl Cleaned {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            text: String::with_capacity(capacity),
            words_start: None,
        }
    }

    fn push(&mut self, next: char) {
        let start = self.text.len();
        self.text.push(next);
        if next == '\n' || WORD_RUN_BREAKS.contains(&next) {
            self.words_start = None;
        } else if !next.is_whitespace() {
            self.words_start.get_or_insert(start);
        }
    }

    fn push_quoted(&mut self) {
        self.text.push_str(QUOTED_PLACEHOLDER);
        self.words_start = None;
    }

    fn push_path(&mut self, start: PathStart) {
        if let (PathStart::Words, Some(words_start)) = (start, self.words_start) {
            self.text.truncate(words_start);
        }
        self.text.push_str(PATH_PLACEHOLDER);
    }
}

fn is_token_opener(next: char) -> bool {
    next == APOSTROPHE || WORD_RUN_BREAKS.contains(&next)
}

/// Keeps at most `limit` bytes of `text`, cutting before a placeholder rather than through one.
pub(super) fn bound(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_owned();
    }
    let kept = prefix_within(text, limit.saturating_sub(TRUNCATION_MARK.len_utf8()));
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

/// The length of a backtick span naming code, as standard panic messages have, rather than text that could be a title.
fn code_span_length(rest: &Peekable<Chars<'_>>) -> Option<usize> {
    let mut chars = rest.clone();
    if chars.next() != Some(CODE_QUOTE) {
        return None;
    }
    let code: String = chars.take_while(|next| *next != CODE_QUOTE).collect();
    let closing = code.chars().count().saturating_add(1);
    let is_closed = rest.clone().nth(closing) == Some(CODE_QUOTE);
    (is_closed && names_code(&code)).then_some(closing.saturating_add(1))
}

fn names_code(span: &str) -> bool {
    let is_code_shaped = span
        .chars()
        .all(|next| next.is_ascii_alphanumeric() || CODE_PUNCTUATION.contains(&next));
    is_code_shaped
        && (span.contains("::") || span.ends_with("()") || STANDARD_VARIANTS.contains(&span))
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

/// Where a path found at a token begins: at the token for a rooted path, or with the words before it for any other.
#[derive(Clone, Copy)]
enum PathStart {
    Token,
    Words,
}

fn path_at(rest: &Peekable<Chars<'_>>) -> Option<PathStart> {
    let token: String = rest
        .clone()
        .take_while(|next| !next.is_whitespace())
        .collect();
    if is_rooted_path(&token) {
        return Some(PathStart::Token);
    }
    let relative = token
        .split(|next| is_token_opener(next) || closing_quote(next).is_some())
        .next()
        .unwrap_or_default();
    (separates_a_name(relative) || names_content_file(relative)).then_some(PathStart::Words)
}

fn separates_a_name(token: &str) -> bool {
    let is_name = |next: char| next.is_alphabetic() || next == '_';
    let is_separator = |next: char| SEPARATORS.contains(&next);
    token
        .chars()
        .zip(token.chars().skip(1))
        .any(|(before, after)| {
            (is_separator(before) && is_name(after)) || (is_name(before) && is_separator(after))
        })
}

fn names_content_file(token: &str) -> bool {
    let name = token
        .trim_end_matches(|next: char| !next.is_alphanumeric())
        .to_lowercase();
    CONTENT_EXTENSIONS
        .iter()
        .any(|extension| name.len() > extension.len() && name.ends_with(extension))
}

fn is_rooted_path(token: &str) -> bool {
    let mut chars = token.chars();
    let first = chars.next();
    let second = chars.next();
    let third = chars.next();
    let is_separator = |c: Option<char>| c.is_some_and(|c| SEPARATORS.contains(&c));
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
