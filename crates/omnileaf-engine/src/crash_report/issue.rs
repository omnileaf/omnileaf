/// Appends `fields` to `form` as query parameters, percent-encoding everything but unreserved characters.
pub(super) fn prefilled(form: &str, fields: &[(&str, &str)]) -> String {
    fields
        .iter()
        .fold(form.to_owned(), |mut url, (name, value)| {
            url.push('&');
            url.push_str(name);
            url.push('=');
            encode_into(&mut url, value);
            url
        })
}

fn encode_into(url: &mut String, value: &str) {
    for byte in value.bytes() {
        if is_unreserved(byte) {
            url.push(char::from(byte));
        } else {
            url.extend(['%', hex_digit(byte >> 4), hex_digit(byte & 0x0F)]);
        }
    }
}

fn is_unreserved(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~')
}

fn hex_digit(nibble: u8) -> char {
    char::from(if nibble < 10 {
        b'0' + nibble
    } else {
        b'A' + nibble - 10
    })
}
