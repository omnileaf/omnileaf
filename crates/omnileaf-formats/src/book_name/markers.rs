use super::{
    number::{Found, Number, NumberRange},
    scan::{byte_before, skip_byte, skip_spaces},
};

const DOT: u8 = b'.';

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MarkerKind {
    Volume,
    Chapter,
}

#[derive(Debug, Clone, Copy)]
enum GapBeforeNumber {
    DotAndSpaces,
    SpacesOnlyAfterDot,
    Nothing,
}

struct MarkerWord {
    kind: MarkerKind,
    word: &'static str,
    gap: GapBeforeNumber,
}

impl MarkerWord {
    const fn volume(word: &'static str, gap: GapBeforeNumber) -> Self {
        Self {
            kind: MarkerKind::Volume,
            word,
            gap,
        }
    }

    const fn chapter(word: &'static str, gap: GapBeforeNumber) -> Self {
        Self {
            kind: MarkerKind::Chapter,
            word,
            gap,
        }
    }
}

const MARKER_WORDS: [MarkerWord; 10] = [
    MarkerWord::volume("volumes", GapBeforeNumber::DotAndSpaces),
    MarkerWord::volume("volume", GapBeforeNumber::DotAndSpaces),
    MarkerWord::volume("vols", GapBeforeNumber::DotAndSpaces),
    MarkerWord::volume("vol", GapBeforeNumber::DotAndSpaces),
    MarkerWord::volume("v", GapBeforeNumber::SpacesOnlyAfterDot),
    MarkerWord::chapter("chapters", GapBeforeNumber::DotAndSpaces),
    MarkerWord::chapter("chapter", GapBeforeNumber::DotAndSpaces),
    MarkerWord::chapter("chs", GapBeforeNumber::DotAndSpaces),
    MarkerWord::chapter("ch", GapBeforeNumber::DotAndSpaces),
    MarkerWord::chapter("c", GapBeforeNumber::Nothing),
];

#[derive(Debug, Default)]
pub(super) struct Markers {
    pub(super) volume: Option<NumberRange>,
    pub(super) chapter: Option<NumberRange>,
}

impl Markers {
    pub(super) fn read(text: &str) -> Self {
        let mut markers = Self::default();
        let mut at = 0;
        while at < text.len() && !markers.has_both() {
            match marker_at(text, at) {
                Some((kind, found)) => {
                    markers.slot(kind).get_or_insert(found.value);
                    at = found.end;
                }
                None => at += 1,
            }
        }
        markers
    }

    const fn has_both(&self) -> bool {
        self.volume.is_some() && self.chapter.is_some()
    }

    const fn slot(&mut self, kind: MarkerKind) -> &mut Option<NumberRange> {
        match kind {
            MarkerKind::Volume => &mut self.volume,
            MarkerKind::Chapter => &mut self.chapter,
        }
    }
}

fn marker_at(text: &str, at: usize) -> Option<(MarkerKind, Found<NumberRange>)> {
    if byte_before(text, at).is_some_and(|byte| byte.is_ascii_alphabetic()) {
        return None;
    }
    MARKER_WORDS
        .iter()
        .find_map(|marker| Some((marker.kind, marker.read(text, at)?)))
}

impl MarkerWord {
    fn read(&self, text: &str, at: usize) -> Option<Found<NumberRange>> {
        let first = self.number_after(text, at)?;
        Some(NumberRange::read_after(text, first, |last| {
            self.number_after(text, last)
                .or_else(|| marker_number(text, last))
        }))
    }

    fn number_after(&self, text: &str, at: usize) -> Option<Found<Number>> {
        let word_end = at + self.word.len();
        if !text.get(at..word_end)?.eq_ignore_ascii_case(self.word) {
            return None;
        }
        marker_number(text, self.gap.number_start(text, word_end))
    }
}

impl GapBeforeNumber {
    fn number_start(self, text: &str, word_end: usize) -> usize {
        let after_dot = skip_byte(text, word_end, DOT);
        match self {
            Self::DotAndSpaces => skip_spaces(text, after_dot),
            Self::SpacesOnlyAfterDot if after_dot > word_end => skip_spaces(text, after_dot),
            Self::SpacesOnlyAfterDot | Self::Nothing => word_end,
        }
    }
}

fn marker_number(text: &str, at: usize) -> Option<Found<Number>> {
    Number::read(text, at).filter(|number| {
        !text
            .as_bytes()
            .get(number.end)
            .is_some_and(u8::is_ascii_alphabetic)
    })
}
