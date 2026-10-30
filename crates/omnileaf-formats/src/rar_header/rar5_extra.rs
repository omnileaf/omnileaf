use super::{fields::Fields, gate::Gate};
use crate::FormatError;

const ENCRYPTION_RECORD: u64 = 0x01;
const HASH_RECORD: u64 = 0x02;
const TIME_RECORD: u64 = 0x03;
const VERSION_RECORD: u64 = 0x04;
const REDIRECTION_RECORD: u64 = 0x05;
const OWNER_RECORD: u64 = 0x06;
const BLAKE2SP: u64 = 0x00;
const BLAKE2SP_BYTES: usize = 32;
const TIME_IS_UNIX: u64 = 0x01;
const TIME_HAS_MTIME: u64 = 0x02;
const TIME_HAS_CTIME: u64 = 0x04;
const TIME_HAS_ATIME: u64 = 0x08;
const TIME_HAS_NANOSECONDS: u64 = 0x10;
const UNIX_TIME_BYTES: usize = 4;
const WINDOWS_TIME_BYTES: usize = 8;
const NANOSECONDS_BYTES: usize = 4;
const OWNER_HAS_USER_NAME: u64 = 0x01;
const OWNER_HAS_GROUP_NAME: u64 = 0x02;
const OWNER_HAS_USER_ID: u64 = 0x04;
const OWNER_HAS_GROUP_ID: u64 = 0x08;

const MALFORMED_RECORD: &str = "a RAR5 extra record is malformed";

/// libarchive reads the records it knows field by field rather than by their declared size, so each known record must fill its size exactly.
pub(super) fn check_extra_area(
    extra: &[u8],
    name: &str,
    gate: &Gate<'_>,
) -> Result<(), FormatError> {
    let malformed = || gate.corrupt(MALFORMED_RECORD);
    let mut records = Fields(extra);
    while !records.0.is_empty() {
        let size = records.count().ok_or_else(malformed)?;
        let mut record = Fields(records.take(size).ok_or_else(malformed)?);
        let kind = record.vint().ok_or_else(malformed)?;
        let read = match kind {
            ENCRYPTION_RECORD => return Err(gate.encrypted()),
            VERSION_RECORD | REDIRECTION_RECORD => {
                return Err(gate.unsupported_entry(name.to_owned()));
            }
            HASH_RECORD => read_hash(&mut record),
            TIME_RECORD => read_times(&mut record),
            OWNER_RECORD => read_owner(&mut record),
            _ => continue,
        };
        if read.is_none() || !record.0.is_empty() {
            return Err(malformed());
        }
    }
    Ok(())
}

fn read_hash(record: &mut Fields<'_>) -> Option<()> {
    (record.vint()? == BLAKE2SP).then_some(())?;
    record.take(BLAKE2SP_BYTES)?;
    Some(())
}

fn read_times(record: &mut Fields<'_>) -> Option<()> {
    let flags = record.vint()?;
    let is_unix = flags & TIME_IS_UNIX != 0;
    let width = if is_unix {
        UNIX_TIME_BYTES
    } else {
        WINDOWS_TIME_BYTES
    };
    let present = [TIME_HAS_MTIME, TIME_HAS_CTIME, TIME_HAS_ATIME]
        .into_iter()
        .filter(|&time| flags & time != 0)
        .count();
    record.take(width.checked_mul(present)?)?;
    if is_unix && flags & TIME_HAS_NANOSECONDS != 0 {
        record.take(NANOSECONDS_BYTES.checked_mul(present)?)?;
    }
    Some(())
}

fn read_owner(record: &mut Fields<'_>) -> Option<()> {
    let flags = record.vint()?;
    for name in [OWNER_HAS_USER_NAME, OWNER_HAS_GROUP_NAME] {
        if flags & name != 0 {
            let length = record.count()?;
            record.take(length)?;
        }
    }
    for id in [OWNER_HAS_USER_ID, OWNER_HAS_GROUP_ID] {
        if flags & id != 0 {
            record.vint()?;
        }
    }
    Some(())
}
