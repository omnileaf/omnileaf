use std::io::{Read, Seek};

use super::{
    entry_type::EntryType,
    fields::Fields,
    gate::{FileHeader, Gate},
    source::Source,
};
use crate::FormatError;

const MAIN: u8 = 0x73;
const FILE: u8 = 0x74;
const COMMENT: u8 = 0x75;
const AUTHENTICITY: u8 = 0x76;
const OLD_SERVICE: u8 = 0x77;
const RECOVERY: u8 = 0x78;
const SIGNATURE: u8 = 0x79;
const SERVICE: u8 = 0x7A;
const END: u8 = 0x7B;
const BLOCK_PREFIX_BYTES: u16 = 7;
const CHECKED_FROM: usize = 2;
const MAIN_FIELDS_BYTES: usize = 6;
const FILE_FIELDS_BYTES: usize = 25;
const ADDED_SIZE_BYTES: usize = 4;
const HAS_ADDED_SIZE: u16 = 0x8000;
const MAIN_IS_VOLUME: u16 = 0x0001;
const MAIN_IS_ENCRYPTED: u16 = 0x0080;
const MAIN_IS_FIRST_VOLUME: u16 = 0x0100;
const END_HAS_NEXT_VOLUME: u16 = 0x0001;
const FILE_CONTINUES_FROM_PREVIOUS_VOLUME: u16 = 0x0001;
const FILE_CONTINUES_IN_NEXT_VOLUME: u16 = 0x0002;
const FILE_IS_ENCRYPTED: u16 = 0x0004;
const FILE_IS_SOLID: u16 = 0x0010;
const FILE_HAS_LARGE_SIZES: u16 = 0x0100;
const FILE_HAS_UNICODE_NAME: u16 = 0x0200;
const STORED: u8 = 0x30;
const HOST_MS_DOS: u8 = 0;
const HOST_OS2: u8 = 1;
const HOST_WINDOWS: u8 = 2;
const HOST_UNIX: u8 = 3;
const HOST_MAC_OS: u8 = 4;
const HOST_BEOS: u8 = 5;
const RAR3_UNPACK_VERSION: u8 = 29;
const VERSION_DIGITS: u8 = 10;
const SOLID_RAR4: &str = "solid RAR 4";
const OPCODE_BITS: u32 = 2;
const OPCODE_MASK: u8 = 0b11;
const LOW_BYTE: u8 = 0;
const WITH_HIGH_BYTE: u8 = 1;
const WHOLE_UNIT: u8 = 2;
const COPY_HAS_CORRECTION: u8 = 0x80;
const COPY_LENGTH: u8 = 0x7F;
const SHORTEST_COPY: usize = 2;
const LOW_SIZES_BYTES: usize = 8;
const HIGH_SIZES_BYTES: usize = 8;
const WINDOWS_SEPARATOR: u8 = b'\\';
const SEPARATOR: u8 = b'/';
const WINDOWS_SEPARATOR_UNIT: u16 = WINDOWS_SEPARATOR as u16;
const SEPARATOR_UNIT: u16 = SEPARATOR as u16;

const MALFORMED_BLOCK: &str = "a RAR 4 block is malformed";
const BAD_BLOCK_CRC: &str = "a RAR 4 block fails its CRC check";
const UNKNOWN_HOST: &str = "an entry comes from an unknown host system";
const FOLDER_WITH_DATA: &str = "a folder entry declares data";
const CONTINUED_ENTRY: &str = "a file block repeats the name of the file block before it";
const UNKNOWN_BLOCK: &str = "the archive has a block of an unknown type";
const SECOND_MAIN_BLOCK: &str = "the archive has a second main block";

struct Prefix {
    checked: Vec<u8>,
    crc16: u16,
    kind: u8,
    flags: u16,
    fields_size: u16,
}

struct Sizes {
    packed: u64,
    unpacked: u64,
}

pub(super) fn walk<S: Read + Seek>(
    source: &mut Source<'_, S>,
    gate: &mut Gate<'_>,
) -> Result<(), FormatError> {
    let mut has_main = false;
    let mut previous_name: Option<Vec<u8>> = None;
    while !source.is_at_end() {
        let prefix = read_prefix(source, gate)?;
        match prefix.kind {
            MAIN if has_main => return Err(gate.corrupt(SECOND_MAIN_BLOCK)),
            MAIN => {
                read_fields(source, &prefix, MAIN_FIELDS_BYTES, gate)?;
                check_main(prefix.flags, gate)?;
                has_main = true;
            }
            FILE => {
                let fields = read_fields(source, &prefix, FILE_FIELDS_BYTES, gate)?;
                let FileBlock { header, name_bytes } =
                    file_block(prefix.flags, &fields, source.position(), gate)?;
                if previous_name.as_ref() == Some(&name_bytes) {
                    return Err(gate.corrupt(CONTINUED_ENTRY));
                }
                previous_name = Some(name_bytes);
                let packed_size = header.packed_size;
                gate.accept_file(header)?;
                source.skip(packed_size)?;
            }
            SERVICE => {
                let fields = read_fields(source, &prefix, FILE_FIELDS_BYTES, gate)?;
                let sizes = sizes(prefix.flags, &mut Fields(&fields))
                    .ok_or_else(|| gate.corrupt(MALFORMED_BLOCK))?;
                gate.count_member()?;
                source.skip(sizes.packed)?;
            }
            COMMENT | AUTHENTICITY | OLD_SERVICE | RECOVERY | SIGNATURE => {
                check_old_block(source, &prefix, gate)?;
                gate.count_member()?;
            }
            END => {
                check_old_block(source, &prefix, gate)?;
                if prefix.flags & END_HAS_NEXT_VOLUME != 0 {
                    return Err(gate.multi_volume());
                }
                return Ok(());
            }
            _ => return Err(gate.corrupt(UNKNOWN_BLOCK)),
        }
    }
    Ok(())
}

fn read_prefix<S: Read + Seek>(
    source: &mut Source<'_, S>,
    gate: &Gate<'_>,
) -> Result<Prefix, FormatError> {
    let bytes = source.read(u64::from(BLOCK_PREFIX_BYTES))?;
    parse_prefix(&bytes).ok_or_else(|| gate.corrupt(MALFORMED_BLOCK))
}

fn parse_prefix(bytes: &[u8]) -> Option<Prefix> {
    let mut fields = Fields(bytes);
    Some(Prefix {
        crc16: fields.u16()?,
        kind: fields.byte()?,
        flags: fields.u16()?,
        fields_size: fields.u16()?.checked_sub(BLOCK_PREFIX_BYTES)?,
        checked: bytes.get(CHECKED_FROM..)?.to_vec(),
    })
}

/// RAR 4 checks a block with the low 16 bits of a CRC32 taken from its type byte onwards.
fn low_half(crc: &flate2::Crc) -> u16 {
    u16::try_from(crc.sum() & u32::from(u16::MAX)).unwrap_or_default()
}

fn read_fields<S: Read + Seek>(
    source: &mut Source<'_, S>,
    prefix: &Prefix,
    minimum: usize,
    gate: &Gate<'_>,
) -> Result<Vec<u8>, FormatError> {
    let fields = source.read(u64::from(prefix.fields_size))?;
    if fields.len() < minimum {
        return Err(gate.corrupt(MALFORMED_BLOCK));
    }
    let mut crc = flate2::Crc::new();
    crc.update(&prefix.checked);
    crc.update(&fields);
    if low_half(&crc) != prefix.crc16 {
        return Err(gate.corrupt(BAD_BLOCK_CRC));
    }
    Ok(fields)
}

/// libarchive checks the end block and the blocks RAR 2 wrote with a CRC that spans the data they add as well as the block.
fn check_old_block<S: Read + Seek>(
    source: &mut Source<'_, S>,
    prefix: &Prefix,
    gate: &Gate<'_>,
) -> Result<(), FormatError> {
    let fields = source.read(u64::from(prefix.fields_size))?;
    let added_size = if prefix.flags & HAS_ADDED_SIZE == 0 {
        0
    } else {
        Fields(&fields)
            .u32()
            .ok_or_else(|| gate.corrupt(MALFORMED_BLOCK))?
    };
    if prefix.flags & HAS_ADDED_SIZE != 0 && fields.len() < ADDED_SIZE_BYTES {
        return Err(gate.corrupt(MALFORMED_BLOCK));
    }
    let mut crc = flate2::Crc::new();
    crc.update(&prefix.checked);
    crc.update(&fields);
    source.add_to_crc32(&mut crc, u64::from(added_size))?;
    if low_half(&crc) != prefix.crc16 {
        return Err(gate.corrupt(BAD_BLOCK_CRC));
    }
    Ok(())
}

fn check_main(flags: u16, gate: &Gate<'_>) -> Result<(), FormatError> {
    if flags & MAIN_IS_ENCRYPTED != 0 {
        return Err(gate.encrypted());
    }
    if flags & (MAIN_IS_VOLUME | MAIN_IS_FIRST_VOLUME) != 0 {
        return Err(gate.multi_volume());
    }
    Ok(())
}

fn sizes(flags: u16, fields: &mut Fields<'_>) -> Option<Sizes> {
    let low_packed = fields.u32()?;
    let low_unpacked = fields.u32()?;
    let mut rest = Fields(fields.0.get(FILE_FIELDS_BYTES - LOW_SIZES_BYTES..)?);
    let (high_packed, high_unpacked) = if flags & FILE_HAS_LARGE_SIZES == 0 {
        (0, 0)
    } else {
        (rest.u32()?, rest.u32()?)
    };
    Some(Sizes {
        packed: u64::from(high_packed) << u32::BITS | u64::from(low_packed),
        unpacked: u64::from(high_unpacked) << u32::BITS | u64::from(low_unpacked),
    })
}

struct FileFields {
    sizes: Sizes,
    host: u8,
    crc32: u32,
    unpack_version: u8,
    method: u8,
    attributes: u32,
    name: DecodedName,
}

struct DecodedName {
    text: String,
    bytes: Vec<u8>,
}

struct FileBlock {
    header: FileHeader,
    name_bytes: Vec<u8>,
}

fn file_fields(flags: u16, bytes: &[u8]) -> Option<FileFields> {
    let mut fields = Fields(bytes);
    let sizes = sizes(flags, &mut fields)?;
    let host = fields.byte()?;
    let crc32 = fields.u32()?;
    fields.u32()?;
    let unpack_version = fields.byte()?;
    let method = fields.byte()?;
    let name_length = usize::from(fields.u16()?);
    let attributes = fields.u32()?;
    if flags & FILE_HAS_LARGE_SIZES != 0 {
        fields.take(HIGH_SIZES_BYTES)?;
    }
    let name = decode_name(flags, fields.take(name_length)?);
    Some(FileFields {
        sizes,
        host,
        crc32,
        unpack_version,
        method,
        attributes,
        name,
    })
}

fn file_block(
    flags: u16,
    bytes: &[u8],
    data_offset: u64,
    gate: &Gate<'_>,
) -> Result<FileBlock, FormatError> {
    let file = file_fields(flags, bytes).ok_or_else(|| gate.corrupt(MALFORMED_BLOCK))?;
    if flags & FILE_IS_ENCRYPTED != 0 {
        return Err(gate.encrypted());
    }
    if flags & (FILE_CONTINUES_FROM_PREVIOUS_VOLUME | FILE_CONTINUES_IN_NEXT_VOLUME) != 0 {
        return Err(gate.multi_volume());
    }
    let is_directory = match entry_type(&file).ok_or_else(|| gate.corrupt(UNKNOWN_HOST))? {
        EntryType::File => {
            check_method(flags, &file, gate)?;
            false
        }
        EntryType::Folder if file.sizes.packed > 0 || file.sizes.unpacked > 0 => {
            return Err(gate.corrupt(FOLDER_WITH_DATA));
        }
        EntryType::Folder => true,
        EntryType::Other => return Err(gate.unsupported_entry(file.name.text)),
    };
    let header = FileHeader {
        name: file.name.text,
        is_directory,
        packed_size: file.sizes.packed,
        unpacked_size: file.sizes.unpacked,
        crc32: Some(file.crc32),
        is_solid: flags & FILE_IS_SOLID != 0,
        data_offset,
    };
    Ok(FileBlock {
        header,
        name_bytes: file.name.bytes,
    })
}

/// libarchive types a RAR 4 entry by its host system and attributes, ignoring the dictionary bits RAR sets on a folder.
fn entry_type(file: &FileFields) -> Option<EntryType> {
    let attributes = u64::from(file.attributes);
    match file.host {
        HOST_MS_DOS | HOST_OS2 | HOST_WINDOWS => Some(EntryType::of_windows_attributes(attributes)),
        HOST_UNIX | HOST_MAC_OS | HOST_BEOS => Some(EntryType::of_unix_mode(attributes)),
        _ => None,
    }
}

/// libarchive's RAR 4 reader refuses a solid entry and never reads the unpack version, decoding every compressed entry as a RAR 3 stream.
fn check_method(flags: u16, file: &FileFields, gate: &Gate<'_>) -> Result<(), FormatError> {
    if flags & FILE_IS_SOLID != 0 {
        return Err(gate.unsupported(SOLID_RAR4.to_owned()));
    }
    if file.method != STORED && file.unpack_version < RAR3_UNPACK_VERSION {
        let version = file.unpack_version;
        return Err(gate.unsupported(format!(
            "RAR {}.{}",
            version / VERSION_DIGITS,
            version % VERSION_DIGITS
        )));
    }
    Ok(())
}

/// RAR 4 stores a Unicode name as UTF-8 when it holds no NUL, and otherwise as an ASCII name, a NUL and a compressed UTF-16 form that libarchive compares as UTF-16BE.
fn decode_name(flags: u16, raw: &[u8]) -> DecodedName {
    match raw.iter().position(|&byte| byte == 0) {
        Some(nul) if flags & FILE_HAS_UNICODE_NAME != 0 => {
            let units: Vec<u16> = decode_wide_name(raw, nul)
                .into_iter()
                .map(|unit| {
                    if unit == WINDOWS_SEPARATOR_UNIT {
                        SEPARATOR_UNIT
                    } else {
                        unit
                    }
                })
                .collect();
            DecodedName {
                text: String::from_utf16_lossy(&units),
                bytes: units.iter().flat_map(|unit| unit.to_be_bytes()).collect(),
            }
        }
        _ => {
            let bytes: Vec<u8> = raw
                .iter()
                .map(|&byte| {
                    if byte == WINDOWS_SEPARATOR {
                        SEPARATOR
                    } else {
                        byte
                    }
                })
                .collect();
            DecodedName {
                text: String::from_utf8_lossy(&bytes).into_owned(),
                bytes,
            }
        }
    }
}

/// Follows libarchive's reading of the compressed form: a high byte, then two-bit opcodes, eight to a flag byte, each adding characters.
fn decode_wide_name(raw: &[u8], nul: usize) -> Vec<u16> {
    let mut encoded = Fields(raw.get(nul + 1..).unwrap_or_default());
    let high_byte = encoded.byte().unwrap_or_default();
    let mut units: Vec<u16> = Vec::new();
    let mut opcodes = 0_u8;
    let mut opcode_bits = 0;
    while units.len() < raw.len() {
        if opcode_bits == 0 {
            let Some(next) = encoded.byte() else { break };
            opcodes = next;
            opcode_bits = u8::BITS;
        }
        opcode_bits -= OPCODE_BITS;
        let added = match (opcodes >> opcode_bits) & OPCODE_MASK {
            LOW_BYTE => encoded.byte().map(|low| vec![u16::from(low)]),
            WITH_HIGH_BYTE => encoded
                .byte()
                .map(|low| vec![u16::from_be_bytes([high_byte, low])]),
            WHOLE_UNIT => encoded.u16().map(|unit| vec![unit]),
            _ => copied_from_ascii(&mut encoded, raw, high_byte, units.len()),
        };
        let Some(added) = added else { break };
        units.extend(added.into_iter().take(raw.len() - units.len()));
    }
    units
}

fn copied_from_ascii(
    encoded: &mut Fields<'_>,
    raw: &[u8],
    high_byte: u8,
    position: usize,
) -> Option<Vec<u16>> {
    let length = encoded.byte()?;
    let (correction, high_byte) = if length & COPY_HAS_CORRECTION == 0 {
        (0, 0)
    } else {
        (encoded.byte()?, high_byte)
    };
    let count = usize::from(length & COPY_LENGTH) + SHORTEST_COPY;
    Some(
        (position..position + count)
            .map(|at| {
                let low = raw
                    .get(at)
                    .copied()
                    .unwrap_or_default()
                    .wrapping_add(correction);
                u16::from_be_bytes([high_byte, low])
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_a_compressed_wide_name_against_its_ascii_form() {
        let ascii = b"p?gina.png";
        let high_byte = 0x00;
        let low_low_copy = 0b00_00_11_00;
        let copy_eight = 8 - 2;
        let raw = [
            &ascii[..],
            &[0],
            &[high_byte, low_low_copy, b'p', 0xE1, copy_eight],
        ]
        .concat();

        let name = decode_name(FILE_HAS_UNICODE_NAME, &raw);

        assert_eq!(name.text, "página.png");
    }
}
