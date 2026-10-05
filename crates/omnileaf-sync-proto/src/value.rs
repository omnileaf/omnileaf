const DIRECT_LIMIT: u8 = 24;
const ONE_BYTE: u8 = 24;
const TWO_BYTES: u8 = 25;
const FOUR_BYTES: u8 = 26;
const EIGHT_BYTES: u8 = 27;
const FALSE: u8 = 0xf4;
const TRUE: u8 = 0xf5;
const NULL: u8 = 0xf6;

const INITIAL_BYTE_LENGTH: usize = 1;

/// A register value the reading state knows, written as deterministic CBOR so every device encodes it to the same bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Value {
    Null,
    Bool(bool),
    Unsigned(u64),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValueError {
    #[error("read a register value: the CBOR ends before the value does")]
    Truncated,
    #[error("read a register value: {count} bytes follow the value")]
    TrailingBytes { count: usize },
    #[error("read a register value: an integer not in its shortest form")]
    NotShortest,
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
            Self::Unsigned(number) => unsigned_cbor(*number),
        }
    }

    pub fn from_cbor(bytes: &[u8]) -> Result<Self, ValueError> {
        let (&initial, rest) = bytes.split_first().ok_or(ValueError::Truncated)?;
        let (value, rest) = match initial {
            FALSE => (Self::Bool(false), rest),
            TRUE => (Self::Bool(true), rest),
            NULL => (Self::Null, rest),
            direct if direct < DIRECT_LIMIT => (Self::Unsigned(u64::from(direct)), rest),
            ONE_BYTE => following(rest, |[byte]| u64::from(byte))?,
            TWO_BYTES => following(rest, |bytes| u64::from(u16::from_be_bytes(bytes)))?,
            FOUR_BYTES => following(rest, |bytes| u64::from(u32::from_be_bytes(bytes)))?,
            EIGHT_BYTES => following(rest, u64::from_be_bytes)?,
            initial => return Err(ValueError::Unsupported { initial }),
        };
        if !rest.is_empty() {
            return Err(ValueError::TrailingBytes { count: rest.len() });
        }
        Ok(value)
    }
}

fn unsigned_cbor(number: u64) -> Vec<u8> {
    if let Ok(byte) = u8::try_from(number) {
        if byte < DIRECT_LIMIT {
            return vec![byte];
        }
        return vec![ONE_BYTE, byte];
    }
    if let Ok(short) = u16::try_from(number) {
        return [&[TWO_BYTES][..], &short.to_be_bytes()].concat();
    }
    if let Ok(word) = u32::try_from(number) {
        return [&[FOUR_BYTES][..], &word.to_be_bytes()].concat();
    }
    [&[EIGHT_BYTES][..], &number.to_be_bytes()].concat()
}

fn following<const LENGTH: usize>(
    rest: &[u8],
    read: impl FnOnce([u8; LENGTH]) -> u64,
) -> Result<(Value, &[u8]), ValueError> {
    let (argument, rest) = rest
        .split_first_chunk::<LENGTH>()
        .ok_or(ValueError::Truncated)?;
    let number = read(*argument);
    if unsigned_cbor(number).len() != INITIAL_BYTE_LENGTH + LENGTH {
        return Err(ValueError::NotShortest);
    }
    Ok((Value::Unsigned(number), rest))
}
