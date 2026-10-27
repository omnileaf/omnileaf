use std::{ops::Range, str::Chars};

const TAG_IN_TITLE: &str = " ";

#[derive(Debug, Clone, Copy)]
pub(super) enum Segment<'a> {
    Text(&'a str),
    Tag(&'a str),
}

impl<'a> Segment<'a> {
    pub(super) fn title_chars(self) -> Chars<'a> {
        match self {
            Self::Text(text) => text.chars(),
            Self::Tag(_) => TAG_IN_TITLE.chars(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Bracket {
    Square,
    Round,
}

impl Bracket {
    const fn opened_by(character: char) -> Option<Self> {
        match character {
            '[' => Some(Self::Square),
            '(' => Some(Self::Round),
            _ => None,
        }
    }

    const fn closer(self) -> char {
        match self {
            Self::Square => ']',
            Self::Round => ')',
        }
    }
}

pub(super) const fn is_bracket(character: char) -> bool {
    matches!(character, '[' | ']' | '(' | ')')
}

#[derive(Debug)]
struct TagBounds {
    open: usize,
    inner: Range<usize>,
    end: usize,
}

pub(super) struct Segments<'a> {
    rest: &'a str,
    square_closer_ahead: bool,
    round_closer_ahead: bool,
}

pub(super) fn segments(name: &str) -> Segments<'_> {
    Segments {
        rest: name,
        square_closer_ahead: true,
        round_closer_ahead: true,
    }
}

pub(super) fn tags(name: &str) -> impl Iterator<Item = &str> {
    segments(name).filter_map(|segment| match segment {
        Segment::Tag(tag) => Some(tag),
        Segment::Text(_) => None,
    })
}

impl Segments<'_> {
    fn next_tag(&mut self) -> Option<TagBounds> {
        let rest = self.rest;
        rest.char_indices().find_map(|(open, character)| {
            let bracket = Bracket::opened_by(character)?;
            let inner_start = open + character.len_utf8();
            let inner_end = self.closer_after(rest, inner_start, bracket)?;
            Some(TagBounds {
                open,
                inner: inner_start..inner_end,
                end: inner_end + bracket.closer().len_utf8(),
            })
        })
    }

    fn closer_after(&mut self, rest: &str, from: usize, bracket: Bracket) -> Option<usize> {
        let closer_ahead = match bracket {
            Bracket::Square => &mut self.square_closer_ahead,
            Bracket::Round => &mut self.round_closer_ahead,
        };
        if !*closer_ahead {
            return None;
        }
        let close = rest.get(from..)?.find(bracket.closer());
        *closer_ahead = close.is_some();
        close.map(|offset| from + offset)
    }
}

impl<'a> Iterator for Segments<'a> {
    type Item = Segment<'a>;

    fn next(&mut self) -> Option<Segment<'a>> {
        if self.rest.is_empty() {
            return None;
        }
        let Some(tag) = self.next_tag() else {
            return Some(Segment::Text(std::mem::take(&mut self.rest)));
        };
        if tag.open > 0 {
            let (text, rest) = self.rest.split_at_checked(tag.open)?;
            self.rest = rest;
            return Some(Segment::Text(text));
        }
        let inner = self.rest.get(tag.inner)?;
        self.rest = self.rest.get(tag.end..)?;
        Some(Segment::Tag(inner))
    }
}
