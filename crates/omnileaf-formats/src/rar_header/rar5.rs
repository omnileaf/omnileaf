use std::io::{Read, Seek};

use super::{
    MAX_DICTIONARY_BYTES, MAX_HEADER_BYTES,
    fields::Fields,
    gate::{FileHeader, Gate},
    rar5_extra::check_extra_area,
    source::Source,
};
use crate::FormatError;

const MARK: u64 = 0;
const MAIN: u64 = 1;
const FILE: u64 = 2;
const SERVICE: u64 = 3;
const ENCRYPTION: u64 = 4;
const END: u64 = 5;
const HAS_EXTRA: u64 = 0x0001;
const HAS_DATA: u64 = 0x0002;
const SKIP_IF_UNKNOWN: u64 = 0x0004;
const DATA_FROM_PREVIOUS_VOLUME: u64 = 0x0008;
const DATA_IN_NEXT_VOLUME: u64 = 0x0010;
const ARCHIVE_IS_VOLUME: u64 = 0x0001;
const ARCHIVE_HAS_VOLUME_NUMBER: u64 = 0x0002;
const END_IS_NOT_LAST_VOLUME: u64 = 0x0001;
const FILE_IS_DIRECTORY: u64 = 0x0001;
const FILE_HAS_TIME: u64 = 0x0002;
const FILE_HAS_CRC32: u64 = 0x0004;
const FILE_SIZE_IS_UNKNOWN: u64 = 0x0008;
const HOST_WINDOWS: u64 = 0;
const HOST_UNIX: u64 = 1;
const WINDOWS_DIRECTORY_ATTRIBUTE: u64 = 0x10;
const UNIX_FILE_TYPE: u64 = 0o170_000;
const UNIX_DIRECTORY: u64 = 0o040_000;
const UNIX_REGULAR_FILE: u64 = 0o100_000;
const ALGORITHM_VERSION: u64 = 0x003F;
const SOLID: u64 = 0x0040;
const DICTIONARY_SHIFT: u32 = 10;
const DICTIONARY_EXPONENT: u64 = 0x1F;
const SMALLEST_DICTIONARY_BYTES: u64 = 128 * 1024;
const CRC_BYTES: u64 = 4;
/// RAR5 caps a header's size field at three bytes, which is what bounds a header to 2 MiB.
const LONGEST_SIZE_FIELD_BYTES: usize = 3;
const VINT_CONTINUES: u8 = 0x80;

const MALFORMED_HEADER: &str = "a RAR5 header is malformed";
const BAD_HEADER_CRC: &str = "a RAR5 header fails its CRC check";
const SECOND_MAIN_HEADER: &str = "the archive has a second main header";
const DATA_ON_A_BARE_HEADER: &str = "a RAR5 header that holds no entry carries data";
const MARK_HEADER: &str = "the archive has a header of the mark type";
const UNKNOWN_HEADER: &str = "the archive has a header of an unknown type that must not be skipped";
const BYTES_PAST_THE_FIELDS: &str = "a RAR5 entry header holds bytes past its fields";
const UNKNOWN_SIZE: &str = "an entry declares no unpacked size";
const UNKNOWN_HOST: &str = "an entry comes from an unknown host system";
const TYPE_DISAGREES: &str = "an entry's attributes disagree with its folder flag";
const FOLDER_WITH_DATA: &str = "a folder entry declares data";
const FILE_WITHOUT_DATA: &str = "a file entry has no data area";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryType {
    File,
    Folder,
    Other,
}

struct Header<'a> {
    kind: u64,
    flags: u64,
    data_size: u64,
    fields: Fields<'a>,
    extra: &'a [u8],
}

impl Header<'_> {
    const fn has_data(&self) -> bool {
        self.flags & HAS_DATA != 0
    }
}

/// libarchive reads a RAR5 header field by field and skips data only after a file or service header, so any header it would read differently is refused.
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
        let is_entry = matches!(header.kind, FILE | SERVICE);
        if !is_entry && header.has_data() {
            return Err(gate.corrupt(DATA_ON_A_BARE_HEADER));
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
            SERVICE => gate.accept_service(&entry_header(header, data_offset, gate)?.header)?,
            END => return check_end(header, gate),
            MARK => return Err(gate.corrupt(MARK_HEADER)),
            _ if header.flags & SKIP_IF_UNKNOWN == 0 => return Err(gate.corrupt(UNKNOWN_HEADER)),
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

struct EntryFields {
    file_flags: u64,
    unpacked_size: u64,
    attributes: u64,
    crc32: Option<u32>,
    compression: u64,
    host: u64,
    name: String,
}

struct Entry {
    header: FileHeader,
    attributes: u64,
    host: u64,
}

fn entry_fields(fields: &mut Fields<'_>) -> Option<EntryFields> {
    let file_flags = fields.vint()?;
    let unpacked_size = fields.vint()?;
    let attributes = fields.vint()?;
    if file_flags & FILE_HAS_TIME != 0 {
        fields.u32()?;
    }
    let crc32 = if file_flags & FILE_HAS_CRC32 == 0 {
        None
    } else {
        Some(fields.u32()?)
    };
    let compression = fields.vint()?;
    let host = fields.vint()?;
    let name_length = fields.count()?;
    let name = String::from_utf8_lossy(fields.take(name_length)?).into_owned();
    Some(EntryFields {
        file_flags,
        unpacked_size,
        attributes,
        crc32,
        compression,
        host,
        name,
    })
}

fn entry_header(
    mut header: Header<'_>,
    data_offset: u64,
    gate: &Gate<'_>,
) -> Result<Entry, FormatError> {
    let entry = entry_fields(&mut header.fields).ok_or_else(|| gate.corrupt(MALFORMED_HEADER))?;
    if !header.fields.0.is_empty() {
        return Err(gate.corrupt(BYTES_PAST_THE_FIELDS));
    }
    check_extra_area(header.extra, &entry.name, gate)?;
    if entry.file_flags & FILE_SIZE_IS_UNKNOWN != 0 {
        return Err(gate.corrupt(UNKNOWN_SIZE));
    }
    let is_directory = entry.file_flags & FILE_IS_DIRECTORY != 0;
    if is_directory {
        if header.has_data() || entry.unpacked_size > 0 {
            return Err(gate.corrupt(FOLDER_WITH_DATA));
        }
    } else {
        check_compression(entry.compression, gate)?;
        if !header.has_data() {
            return Err(gate.corrupt(FILE_WITHOUT_DATA));
        }
    }
    Ok(Entry {
        header: FileHeader {
            name: entry.name,
            is_directory,
            packed_size: header.data_size,
            unpacked_size: entry.unpacked_size,
            crc32: entry.crc32,
            is_solid: entry.compression & SOLID != 0,
            data_offset,
        },
        attributes: entry.attributes,
        host: entry.host,
    })
}

fn file_header(
    header: Header<'_>,
    data_offset: u64,
    gate: &Gate<'_>,
) -> Result<FileHeader, FormatError> {
    let entry = entry_header(header, data_offset, gate)?;
    let entry_type = match entry.host {
        HOST_WINDOWS if entry.attributes & WINDOWS_DIRECTORY_ATTRIBUTE != 0 => EntryType::Folder,
        HOST_WINDOWS => EntryType::File,
        HOST_UNIX => unix_entry_type(entry.attributes),
        _ => return Err(gate.corrupt(UNKNOWN_HOST)),
    };
    let flagged_type = if entry.header.is_directory {
        EntryType::Folder
    } else {
        EntryType::File
    };
    if entry_type == EntryType::Other {
        return Err(gate.unsupported_entry(entry.header.name));
    }
    if entry_type != flagged_type {
        return Err(gate.corrupt(TYPE_DISAGREES));
    }
    Ok(entry.header)
}

/// libarchive takes a Unix entry's type from the `st_mode` stored as its attributes.
const fn unix_entry_type(mode: u64) -> EntryType {
    match mode & UNIX_FILE_TYPE {
        UNIX_DIRECTORY => EntryType::Folder,
        UNIX_REGULAR_FILE => EntryType::File,
        _ => EntryType::Other,
    }
}

fn check_compression(compression: u64, gate: &Gate<'_>) -> Result<(), FormatError> {
    let version = compression & ALGORITHM_VERSION;
    if version > 0 {
        return Err(gate.unsupported(format!("RAR5 algorithm version {version}")));
    }
    if dictionary_bytes(compression) > MAX_DICTIONARY_BYTES {
        return Err(gate.dictionary_too_large(MAX_DICTIONARY_BYTES));
    }
    Ok(())
}

/// RAR5 gives an entry's dictionary as 128 KiB shifted left by a five-bit exponent of its compression information.
fn dictionary_bytes(compression: u64) -> u64 {
    let exponent = (compression >> DICTIONARY_SHIFT) & DICTIONARY_EXPONENT;
    SMALLEST_DICTIONARY_BYTES << exponent
}
