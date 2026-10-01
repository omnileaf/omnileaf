use std::cmp::Ordering;

use unicode_normalization::UnicodeNormalization;

#[derive(Debug, PartialEq, Eq)]
enum Token {
    Text(char),
    Number(String),
}

impl Token {
    fn first_char(&self) -> char {
        match self {
            Self::Text(text) => *text,
            Self::Number(digits) => digits.chars().next().unwrap_or('0'),
        }
    }
}

/// Orders names as people read them, ignoring case and width and comparing digit runs by value; only identical names compare equal.
#[must_use]
pub fn natural_cmp(left: &str, right: &str) -> Ordering {
    compare_tokens(&tokens(left), &tokens(right)).then_with(|| left.cmp(right))
}

fn tokens(name: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    for character in name.nfkc().flat_map(char::to_lowercase) {
        match (character.is_ascii_digit(), tokens.last_mut()) {
            (true, Some(Token::Number(digits))) => digits.push(character),
            (true, _) => tokens.push(Token::Number(character.to_string())),
            (false, _) => tokens.push(Token::Text(character)),
        }
    }
    tokens
}

fn compare_tokens(left: &[Token], right: &[Token]) -> Ordering {
    left.iter()
        .zip(right)
        .map(|pair| match pair {
            (Token::Number(left), Token::Number(right)) => compare_numbers(left, right),
            (left, right) => left.first_char().cmp(&right.first_char()),
        })
        .find(|ordering| ordering.is_ne())
        .unwrap_or_else(|| left.len().cmp(&right.len()))
}

fn compare_numbers(left: &str, right: &str) -> Ordering {
    let left_value = left.trim_start_matches('0');
    let right_value = right.trim_start_matches('0');
    left_value
        .len()
        .cmp(&right_value.len())
        .then_with(|| left_value.cmp(right_value))
        .then_with(|| left.len().cmp(&right.len()))
}
