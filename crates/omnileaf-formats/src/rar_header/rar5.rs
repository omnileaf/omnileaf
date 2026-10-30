use std::io::{Read, Seek};

use super::{
    MAX_DICTIONARY_BYTES, MAX_HEADER_BYTES,
    fields::Fields,
    gate::{FileHeader, Gate},
    source::Source,
};
use crate::FormatError;

const MAIN: u64 = 1;
const FILE: u64 = 2;
const ENCRYPTION: u64 = 4;
const END: u64 = 5;
const HAS_EXTRA: u64 = 0x0001;
const HAS_DATA: u64 = 0x0002;
const DATA_FROM_PREVIOUS_VOLUME: u64 = 0x0008;
const DATA_IN_NEXT_VOLUME: u64 = 0x0010;
const ARCHIVE_IS_VOLUME: u64 = 0x0001;
const ARCHIVE_HAS_VOLUME_NUMBER: u64 = 0x0002;
const END_IS_NOT_LAST_VOLUME: u64 = 0x0001;
const FILE_IS_DIRECTORY: u64 = 0x0001;
const FILE_HAS_TIME: u64 = 0x0002;
const FILE_HAS_CRC32: u64 = 0x0004;
const ALGORITHM_VERSION: u64 = 0x003F;
const SOLID: u64 = 0x0040;
const DICTIONARY_SHIFT: u32 = 10;
const DICTIONARY_EXPONENT: u64 = 0x1F;
const SMALLEST_DICTIONARY_BYTES: u64 = 128 * 1024;
const ENCRYPTION_RECORD: u64 = 0x01;
const CRC_BYTES: u64 = 4;
/// RAR5 caps a header's size field at three bytes, which is what bounds a header to 2 MiB.
const LONGEST_SIZE_FIELD_BYTES: usize = 3;
const VINT_CONTINUES: u8 = 0x80;

const MALFORMED_HEADER: &str = "a RAR5 header is malformed";
const BAD_HEADER_CRC: &str = "a RAR5 header fails its CRC check";
const SECOND_MAIN_HEADER: &str = "the archive has a second main header";

struct Header<'a> {
    kind: u64,
    flags: u64,
    data_size: u64,
    fields: Fields<'a>,
    extra: &'a [u8],
}

pub(super) fn walk<S: Read + Seek>(
    source: &mut Source<'_, S>,
    gate: &mut Gate<'_>,
) -> Result<(), FormatError> {
    let mut has_main = false;
    while !source.is_at_end() {
        let body = read_header(source, gate)?;
        let header = parse(&body).ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
        if header.flags & (DATA_FROM_PREVIOUS_VOLUME | DATA_IN_NEXT_VOLUME) != 0 {
            return Err(gate.multi_volume());
        }
        let data_offset = source.position();
        let data_size = header.data_size;
        match header.kind {
            ENCRYPTION => return Err(gate.encrypted()),
            MAIN if has_main => return Err(gate.corrupt(SECOND_MAIN_HEADER)),
            MAIN => {
                check_main(header, gate)?;
                has_main = true;
            }
            FILE => gate.accept_file(file_header(header, data_offset, gate)?)?,
            END => return check_end(header, gate),
            _ => gate.count_member()?,
        }
        source.skip(data_size)?;
    }
    Ok(())
}

fn read_header<S: Read + Seek>(
    source: &mut Source<'_, S>,
    gate: &Gate<'_>,
) -> Result<Vec<u8>, FormatError> {
    let crc = source.read(CRC_BYTES)?;
    let mut size_field = Vec::new();
    loop {
        if size_field.len() == LONGEST_SIZE_FIELD_BYTES {
            return Err(gate.header_too_large(MAX_HEADER_BYTES));
        }
        let byte = source.byte()?;
        size_field.push(byte);
        if byte & VINT_CONTINUES == 0 {
            break;
        }
    }
    let size = Fields(&size_field)
        .vint()
        .ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
    let body = source.read(size)?;
    let mut checked = flate2::Crc::new();
    checked.update(&size_field);
    checked.update(&body);
    if crc != checked.sum().to_le_bytes() {
        return Err(gate.corrupt(BAD_HEADER_CRC));
    }
    Ok(body)
}

fn parse(body: &[u8]) -> Option<Header<'_>> {
    let mut fields = Fields(body);
    let kind = fields.vint()?;
    let flags = fields.vint()?;
    let extra_size = if flags & HAS_EXTRA == 0 {
        0
    } else {
        fields.count()?
    };
    let data_size = if flags & HAS_DATA == 0 {
        0
    } else {
        fields.vint()?
    };
    let (specific, extra) = fields
        .0
        .split_at_checked(fields.0.len().checked_sub(extra_size)?)?;
    Some(Header {
        kind,
        flags,
        data_size,
        fields: Fields(specific),
        extra,
    })
}

fn check_main(mut header: Header<'_>, gate: &Gate<'_>) -> Result<(), FormatError> {
    let archive_flags = header
        .fields
        .vint()
        .ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
    if archive_flags & (ARCHIVE_IS_VOLUME | ARCHIVE_HAS_VOLUME_NUMBER) != 0 {
        return Err(gate.multi_volume());
    }
    Ok(())
}

fn check_end(mut header: Header<'_>, gate: &Gate<'_>) -> Result<(), FormatError> {
    let end_flags = header
        .fields
        .vint()
        .ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
    if end_flags & END_IS_NOT_LAST_VOLUME != 0 {
        return Err(gate.multi_volume());
    }
    Ok(())
}

struct FileFields {
    is_directory: bool,
    unpacked_size: u64,
    crc32: Option<u32>,
    compression: u64,
    name: String,
}

fn file_fields(fields: &mut Fields<'_>) -> Option<FileFields> {
    let file_flags = fields.vint()?;
    let unpacked_size = fields.vint()?;
    fields.vint()?;
    if file_flags & FILE_HAS_TIME != 0 {
        fields.u32()?;
    }
    let crc32 = if file_flags & FILE_HAS_CRC32 == 0 {
        None
    } else {
        Some(fields.u32()?)
    };
    let compression = fields.vint()?;
    fields.vint()?;
    let name_length = fields.count()?;
    let name = String::from_utf8_lossy(fields.take(name_length)?).into_owned();
    Some(FileFields {
        is_directory: file_flags & FILE_IS_DIRECTORY != 0,
        unpacked_size,
        crc32,
        compression,
        name,
    })
}

fn file_header(
    mut header: Header<'_>,
    data_offset: u64,
    gate: &Gate<'_>,
) -> Result<FileHeader, FormatError> {
    let file = file_fields(&mut header.fields).ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
    if has_encryption_record(header.extra).ok_or_else(|| gate.corrupt(MALFORMED_HEADER))? {
        return Err(gate.encrypted());
    }
    let version = file.compression & ALGORITHM_VERSION;
    if version > 0 {
        return Err(gate.unsupported(format!("RAR5 algorithm version {version}")));
    }
    if !file.is_directory && dictionary_bytes(file.compression) > MAX_DICTIONARY_BYTES {
        return Err(gate.dictionary_too_large(MAX_DICTIONARY_BYTES));
    }
    Ok(FileHeader {
        name: file.name,
        is_directory: file.is_directory,
        packed_size: header.data_size,
        unpacked_size: file.unpacked_size,
        crc32: file.crc32,
        is_solid: file.compression & SOLID != 0,
        data_offset,
    })
}

fn has_encryption_record(extra: &[u8]) -> Option<bool> {
    let mut records = Fields(extra);
    while !records.0.is_empty() {
        let size = records.count()?;
        let kind = Fields(records.take(size)?).vint()?;
        if kind == ENCRYPTION_RECORD {
            return Some(true);
        }
    }
    Some(false)
}

/// RAR5 gives an entry's dictionary as 128 KiB shifted left by a five-bit exponent of its compression information.
fn dictionary_bytes(compression: u64) -> u64 {
    let exponent = (compression >> DICTIONARY_SHIFT) & DICTIONARY_EXPONENT;
    SMALLEST_DICTIONARY_BYTES << exponent
}
