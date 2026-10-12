use std::{
    io::{Read, Seek, SeekFrom},
    ops::Range,
    path::Path,
};

use crate::{
    FormatError, Limits,
    sevenz_book::{MAX_DICTIONARY_BYTES, dictionary_bytes},
};

const SIGNATURE_HEADER_LENGTH: usize = 32;
const START_HEADER: Range<usize> = 8..32;
const NEXT_HEADER_OFFSET: Range<usize> = 12..20;
const NEXT_HEADER_SIZE: Range<usize> = 20..28;
const HEADER_BYTES_PER_ENTRY: u64 = 128;
const HEADER_LIMIT_FLOOR: u64 = 64 * 1024;

const END: u8 = 0x00;
const PACK_INFO: u8 = 0x06;
const UNPACK_INFO: u8 = 0x07;
const SIZE: u8 = 0x09;
const CRC: u8 = 0x0A;
const FOLDER: u8 = 0x0B;
const CODERS_UNPACK_SIZE: u8 = 0x0C;
const ENCODED_HEADER: u8 = 0x17;
const NOT_EXTERNAL: u8 = 0x00;
const CODER_ID_LENGTH: u8 = 0x0F;
const COMPLEX_CODER: u8 = 0x10;
const HAS_PROPERTIES: u8 = 0x20;
const ALTERNATIVE_METHODS: u8 = 0x80;
const CRC_BYTES: usize = 4;

const NO_START_HEADER: &str = "the archive has no start header";
const MALFORMED_HEADER: &str = "the archive's encoded header is malformed";

/// The decoder trusts the sizes and dictionary an archive's header declares, so this refuses a header it would decode into more memory than the limits allow.
pub(crate) fn check_header(
    source: &mut (impl Read + Seek),
    path: &Path,
    limits: &Limits,
) -> Result<(), FormatError> {
    let mut signature_header = [0; SIGNATURE_HEADER_LENGTH];
    source
        .seek(SeekFrom::Start(0))
        .and_then(|_| source.read_exact(&mut signature_header))
        .map_err(|source| corrupt(path, source.into()))?;
    if signature_header
        .get(START_HEADER)
        .is_none_or(|start| start.iter().all(|&byte| byte == 0))
    {
        return Err(corrupt(
            path,
            sevenz_rust2::Error::Other(NO_START_HEADER.into()),
        ));
    }
    let limit = header_limit(limits);
    let size = u64_at(&signature_header, NEXT_HEADER_SIZE);
    if size > limit {
        return Err(FormatError::HeaderTooLarge {
            path: path.to_owned(),
            limit,
        });
    }
    let next_header = read_next_header(source, u64_at(&signature_header, NEXT_HEADER_OFFSET), size)
        .map_err(|source| corrupt(path, source.into()))?;
    let Some((&ENCODED_HEADER, streams_info)) = next_header.split_first() else {
        return Ok(());
    };
    let blocks = encoded_header_blocks(streams_info)
        .ok_or_else(|| corrupt(path, sevenz_rust2::Error::Other(MALFORMED_HEADER.into())))?;
    for block in blocks {
        if block.largest_unpack_size > limit {
            return Err(FormatError::HeaderTooLarge {
                path: path.to_owned(),
                limit,
            });
        }
        if block.dictionary_bytes > MAX_DICTIONARY_BYTES {
            return Err(FormatError::DictionaryTooLarge {
                path: path.to_owned(),
                limit: MAX_DICTIONARY_BYTES,
            });
        }
    }
    Ok(())
}

fn header_limit(limits: &Limits) -> u64 {
    u64::try_from(limits.max_entries)
        .unwrap_or(u64::MAX)
        .saturating_mul(HEADER_BYTES_PER_ENTRY)
        .max(HEADER_LIMIT_FLOOR)
}

fn u64_at(bytes: &[u8], range: Range<usize>) -> u64 {
    bytes
        .get(range)
        .and_then(|field| <[u8; 8]>::try_from(field).ok())
        .map_or(0, u64::from_le_bytes)
}

fn read_next_header(
    source: &mut (impl Read + Seek),
    offset: u64,
    size: u64,
) -> std::io::Result<Vec<u8>> {
    let start = u64::try_from(SIGNATURE_HEADER_LENGTH)
        .ok()
        .and_then(|length| length.checked_add(offset))
        .ok_or(std::io::ErrorKind::InvalidData)?;
    let length = usize::try_from(size).map_err(|_| std::io::ErrorKind::InvalidData)?;
    source.seek(SeekFrom::Start(start))?;
    let mut next_header = vec![0; length];
    source.read_exact(&mut next_header)?;
    Ok(next_header)
}

fn corrupt(path: &Path, source: sevenz_rust2::Error) -> FormatError {
    FormatError::CorruptSevenZip {
        path: path.to_owned(),
        source,
    }
}

struct HeaderBlock {
    dictionary_bytes: u64,
    outputs: u64,
    largest_unpack_size: u64,
}

/// Reads the blocks that hold an encoded header from its streams info, taking only as many items as there are bytes, so a declared count can't make it allocate.
fn encoded_header_blocks(streams_info: &[u8]) -> Option<Vec<HeaderBlock>> {
    let mut reader = HeaderReader(streams_info);
    let mut id = reader.byte()?;
    if id == PACK_INFO {
        skip_pack_info(&mut reader)?;
        id = reader.byte()?;
    }
    if id != UNPACK_INFO || reader.byte()? != FOLDER {
        return Some(Vec::new());
    }
    let count = reader.count()?;
    if reader.byte()? != NOT_EXTERNAL {
        return None;
    }
    let mut blocks = Vec::new();
    for _ in 0..count {
        blocks.push(read_block(&mut reader)?);
    }
    if reader.byte()? != CODERS_UNPACK_SIZE {
        return None;
    }
    for block in &mut blocks {
        for _ in 0..block.outputs {
            block.largest_unpack_size = block.largest_unpack_size.max(reader.number()?);
        }
    }
    Some(blocks)
}

fn skip_pack_info(reader: &mut HeaderReader<'_>) -> Option<()> {
    reader.number()?;
    let streams = reader.count()?;
    let mut id = reader.byte()?;
    if id == SIZE {
        for _ in 0..streams {
            reader.number()?;
        }
        id = reader.byte()?;
    }
    if id == CRC {
        skip_digests(reader, streams)?;
        id = reader.byte()?;
    }
    (id == END).then_some(())
}

fn skip_digests(reader: &mut HeaderReader<'_>, count: usize) -> Option<()> {
    let defined = if reader.byte()? == 0 {
        let bits = reader.take(count.div_ceil(8))?;
        (0..count)
            .filter(|bit| {
                bits.get(bit / 8)
                    .is_some_and(|byte| byte & (0x80 >> (bit % 8)) != 0)
            })
            .count()
    } else {
        count
    };
    reader.take(defined.checked_mul(CRC_BYTES)?)?;
    Some(())
}

fn read_block(reader: &mut HeaderReader<'_>) -> Option<HeaderBlock> {
    let coders = reader.count()?;
    let (mut inputs, mut outputs, mut dictionary) = (0_u64, 0_u64, 0_u64);
    for _ in 0..coders {
        let flags = reader.byte()?;
        if flags & ALTERNATIVE_METHODS != 0 {
            return None;
        }
        let method = reader.take(usize::from(flags & CODER_ID_LENGTH))?;
        let (coder_inputs, coder_outputs) = if flags & COMPLEX_CODER == 0 {
            (1, 1)
        } else {
            (reader.number()?, reader.number()?)
        };
        inputs = inputs.checked_add(coder_inputs)?;
        outputs = outputs.checked_add(coder_outputs)?;
        let properties = if flags & HAS_PROPERTIES == 0 {
            &[]
        } else {
            let length = reader.count()?;
            reader.take(length)?
        };
        dictionary = dictionary.saturating_add(dictionary_bytes(method, properties));
    }
    let bind_pairs = outputs.checked_sub(1)?;
    for _ in 0..bind_pairs {
        reader.number()?;
        reader.number()?;
    }
    let packed_streams = inputs.checked_sub(bind_pairs)?;
    if packed_streams > 1 {
        for _ in 0..packed_streams {
            reader.number()?;
        }
    }
    Some(HeaderBlock {
        dictionary_bytes: dictionary,
        outputs,
        largest_unpack_size: 0,
    })
}

struct HeaderReader<'a>(&'a [u8]);

impl<'a> HeaderReader<'a> {
    fn byte(&mut self) -> Option<u8> {
        let (&first, rest) = self.0.split_first()?;
        self.0 = rest;
        Some(first)
    }

    fn take(&mut self, length: usize) -> Option<&'a [u8]> {
        let (taken, rest) = self.0.split_at_checked(length)?;
        self.0 = rest;
        Some(taken)
    }

    /// 7z numbers spend one leading set bit of their first byte per little-endian byte that follows.
    fn number(&mut self) -> Option<u64> {
        let first = self.byte()?;
        let mut value = 0_u64;
        for index in 0..8 {
            let mask = 0x80_u8 >> index;
            if first & mask == 0 {
                return Some(value | (u64::from(first & (mask - 1)) << (8 * index)));
            }
            value |= u64::from(self.byte()?) << (8 * index);
        }
        Some(value)
    }

    fn count(&mut self) -> Option<usize> {
        usize::try_from(self.number()?)
            .ok()
            .filter(|&count| count <= self.0.len())
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    #[test]
    fn refuses_an_archive_without_a_start_header() {
        let mut bytes = b"7z\xbc\xaf\x27\x1c\x00\x04".to_vec();
        bytes.resize(SIGNATURE_HEADER_LENGTH + 64, 0);

        let error = check_header(
            &mut Cursor::new(bytes),
            Path::new("book.cb7"),
            &Limits::default(),
        )
        .unwrap_err();

        assert!(
            matches!(&error, FormatError::CorruptSevenZip { source: sevenz_rust2::Error::Other(message), .. } if message == NO_START_HEADER),
            "{error:?}"
        );
    }

    #[test]
    fn reads_7z_numbers_of_every_length() {
        let cases: [(&[u8], u64); 4] = [
            (&[0x7F], 0x7F),
            (&[0x81, 0x23], 0x0123),
            (&[0xC1, 0x23, 0x45], 0x01_4523),
            (&[0xFF, 1, 2, 3, 4, 5, 6, 7, 8], 0x0807_0605_0403_0201),
        ];

        let read: Vec<Option<u64>> = cases
            .iter()
            .map(|(bytes, _)| HeaderReader(bytes).number())
            .collect();

        let expected: Vec<Option<u64>> = cases.iter().map(|&(_, value)| Some(value)).collect();
        assert_eq!(read, expected);
    }
}
