const MAJOR_SHIFT: u8 = 5;
const ARGUMENT_MASK: u8 = 0b1_1111;
const UNSIGNED: u8 = 0;
const TEXT: u8 = 3;
const DIRECT_LIMIT: u8 = 24;
const ONE_BYTE: u8 = 24;
const TWO_BYTES: u8 = 25;
const FOUR_BYTES: u8 = 26;
const EIGHT_BYTES: u8 = 27;
const FALSE: u8 = 0xf4;
const TRUE: u8 = 0xf5;
const NULL: u8 = 0xf6;

const INITIAL_BYTE_LENGTH: usize = 1;

/// Written as deterministic CBOR so every device encodes a value to the same bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Value {
    Null,
    Bool(bool),
    Unsigned(u64),
    Text(String),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValueError {
    #[error("read a register value: the CBOR ends before the value does")]
    Truncated,
    #[error("read a register value: {count} bytes follow the value")]
    TrailingBytes { count: usize },
    #[error("read a register value: an integer or length not in its shortest form")]
    NotShortest,
    #[error("read a register value: a text that is not valid UTF-8")]
    NotUtf8,
    #[error(
        "read a register value: CBOR initial byte {initial:#04x} is not a value this version reads"
    )]
    Unsupported { initial: u8 },
}

impl Value {
    #[must_use]
    pub fn to_cbor(&self) -> Vec<u8> {
        match self {
            Self::Null => vec![NULL],
            Self::Bool(false) => vec![FALSE],
            Self::Bool(true) => vec![TRUE],
            Self::Unsigned(number) => head_cbor(UNSIGNED, *number),
            Self::Text(text) => [
                head_cbor(TEXT, u64::try_from(text.len()).unwrap_or(u64::MAX)),
                text.as_bytes().to_vec(),
            ]
            .concat(),
        }
    }

    pub fn from_cbor(bytes: &[u8]) -> Result<Self, ValueError> {
        let (&initial, rest) = bytes.split_first().ok_or(ValueError::Truncated)?;
        let (value, rest) = match initial {
            FALSE => (Self::Bool(false), rest),
            TRUE => (Self::Bool(true), rest),
            NULL => (Self::Null, rest),
            initial => match initial >> MAJOR_SHIFT {
                UNSIGNED => {
                    let (number, rest) = argument(initial, rest, UNSIGNED)?;
                    (Self::Unsigned(number), rest)
                }
                TEXT => {
                    let (length, rest) = argument(initial, rest, TEXT)?;
                    let length = usize::try_from(length).map_err(|_| ValueError::Truncated)?;
                    let (text, rest) =
                        rest.split_at_checked(length).ok_or(ValueError::Truncated)?;
                    let text = std::str::from_utf8(text).map_err(|_| ValueError::NotUtf8)?;
                    (Self::Text(text.to_owned()), rest)
                }
                _ => return Err(ValueError::Unsupported { initial }),
            },
        };
        if !rest.is_empty() {
            return Err(ValueError::TrailingBytes { count: rest.len() });
        }
        Ok(value)
    }
}

fn head_cbor(major: u8, number: u64) -> Vec<u8> {
    let major = major << MAJOR_SHIFT;
    if let Ok(byte) = u8::try_from(number) {
        if byte < DIRECT_LIMIT {
            return vec![major | byte];
        }
        return vec![major | ONE_BYTE, byte];
    }
    if let Ok(short) = u16::try_from(number) {
        return [&[major | TWO_BYTES][..], &short.to_be_bytes()].concat();
    }
    if let Ok(word) = u32::try_from(number) {
        return [&[major | FOUR_BYTES][..], &word.to_be_bytes()].concat();
    }
    [&[major | EIGHT_BYTES][..], &number.to_be_bytes()].concat()
}

fn argument(initial: u8, rest: &[u8], major: u8) -> Result<(u64, &[u8]), ValueError> {
    match initial & ARGUMENT_MASK {
        direct if direct < DIRECT_LIMIT => Ok((u64::from(direct), rest)),
        ONE_BYTE => following(rest, major, |[byte]| u64::from(byte)),
        TWO_BYTES => following(rest, major, |bytes| u64::from(u16::from_be_bytes(bytes))),
        FOUR_BYTES => following(rest, major, |bytes| u64::from(u32::from_be_bytes(bytes))),
        EIGHT_BYTES => following(rest, major, u64::from_be_bytes),
        _ => Err(ValueError::Unsupported { initial }),
    }
}

fn following<const LENGTH: usize>(
    rest: &[u8],
    major: u8,
    read: impl FnOnce([u8; LENGTH]) -> u64,
) -> Result<(u64, &[u8]), ValueError> {
    let (argument, rest) = rest
        .split_first_chunk::<LENGTH>()
        .ok_or(ValueError::Truncated)?;
    let number = read(*argument);
    if head_cbor(major, number).len() != INITIAL_BYTE_LENGTH + LENGTH {
        return Err(ValueError::NotShortest);
    }
    Ok((number, rest))
}
