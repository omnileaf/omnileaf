use super::tags::{Segment, is_bracket, segments};

pub(super) enum Title {
    Text(String),
    OnlyTags(String),
}

impl Title {
    pub(super) fn into_string(self) -> String {
        match self {
            Self::Text(title) | Self::OnlyTags(title) => title,
        }
    }
}

pub(super) fn read_title(name: &str) -> Title {
    let mut title = String::with_capacity(name.len());
    title.extend(squeezed(segments(name).flat_map(Segment::title_chars)));
    if !title.is_empty() {
        return Title::Text(title);
    }
    title.extend(squeezed(
        name.chars().filter(|character| !is_bracket(*character)),
    ));
    Title::OnlyTags(title)
}

pub(super) fn squeezed<I: Iterator<Item = char>>(chars: I) -> Squeezed<I> {
    Squeezed {
        chars,
        held: None,
        seen_text: false,
    }
}

pub(super) struct Squeezed<I> {
    chars: I,
    held: Option<char>,
    seen_text: bool,
}

const fn reads_as_space(character: char) -> bool {
    character == '_' || character.is_whitespace()
}

impl<I: Iterator<Item = char>> Iterator for Squeezed<I> {
    type Item = char;

    fn next(&mut self) -> Option<char> {
        if let Some(character) = self.held.take() {
            return Some(character);
        }
        let mut gap = false;
        loop {
            let character = self.chars.next()?;
            if reads_as_space(character) {
                gap = self.seen_text;
                continue;
            }
            self.seen_text = true;
            if gap {
                self.held = Some(character);
                return Some(' ');
            }
            return Some(character);
        }
    }
}
