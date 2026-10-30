use std::fmt::{self, Write};

const BIDI_CONTROLS: [char; 12] = [
    '\u{061c}', '\u{200e}', '\u{200f}', '\u{202a}', '\u{202b}', '\u{202c}', '\u{202d}', '\u{202e}',
    '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}',
];

pub(crate) struct InertLine<'a>(pub(crate) &'a str);

pub(crate) struct InertText<'a>(pub(crate) &'a str);

impl fmt::Display for InertLine<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_inert(f, self.0, |_| false)
    }
}

impl fmt::Display for InertText<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_inert(f, self.0, |character| matches!(character, '\n' | '\t'))
    }
}

fn write_inert(
    f: &mut fmt::Formatter<'_>,
    text: &str,
    is_layout: impl Fn(char) -> bool,
) -> fmt::Result {
    for character in text.chars() {
        if is_layout(character) || !is_active(character) {
            f.write_char(character)?;
        } else {
            write!(f, "{}", character.escape_default())?;
        }
    }
    Ok(())
}

fn is_active(character: char) -> bool {
    character.is_control() || BIDI_CONTROLS.contains(&character)
}
