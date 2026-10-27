const SPACE: u8 = b' ';

pub(super) fn skip_spaces(text: &str, mut at: usize) -> usize {
    while text.as_bytes().get(at) == Some(&SPACE) {
        at += 1;
    }
    at
}

pub(super) fn skip_byte(text: &str, at: usize, byte: u8) -> usize {
    if text.as_bytes().get(at) == Some(&byte) {
        at + 1
    } else {
        at
    }
}

pub(super) fn byte_before(text: &str, at: usize) -> Option<u8> {
    at.checked_sub(1)
        .and_then(|before| text.as_bytes().get(before))
        .copied()
}
