use crate::rar::crc32;

const CRC_BYTES: usize = 4;
const ENCRYPTION: u64 = 4;
const END: u64 = 5;
const HAS_EXTRA: u64 = 0x0001;
const HAS_DATA: u64 = 0x0002;
const VINT_DATA_BITS: u32 = 7;
const VINT_DATA_MASK: u8 = 0x7F;
const VINT_CONTINUES: u8 = 0x80;
const LONGEST_VINT_BYTES: usize = 10;

struct Header {
    end: usize,
    next: Option<usize>,
}

pub(super) fn refresh(archive: &mut [u8], first_header: usize) {
    let mut start = first_header;
    while let Some(header) = read_header(archive, start) {
        if write_crc32(archive, start, header.end).is_none() {
            return;
        }
        let Some(next) = header.next else { return };
        start = next;
    }
}

fn read_header(archive: &[u8], start: usize) -> Option<Header> {
    let size_at = start.checked_add(CRC_BYTES)?;
    let mut after_crc = Vints(archive.get(size_at..)?);
    let size = usize::try_from(after_crc.next()?).ok()?;
    let body = after_crc.0.get(..size)?;
    let body_start = archive.len().checked_sub(after_crc.0.len())?;
    let end = body_start.checked_add(size)?;
    Some(Header {
        end,
        next: data_size_unless_last(body).and_then(|data_size| end.checked_add(data_size)),
    })
}

/// Everything after a RAR5 encryption header is encrypted, and nothing after the end header is read.
fn data_size_unless_last(body: &[u8]) -> Option<usize> {
    let mut fields = Vints(body);
    let kind = fields.next()?;
    let flags = fields.next()?;
    if matches!(kind, ENCRYPTION | END) {
        return None;
    }
    if flags & HAS_EXTRA != 0 {
        fields.next()?;
    }
    if flags & HAS_DATA == 0 {
        return Some(0);
    }
    usize::try_from(fields.next()?).ok()
}

fn write_crc32(archive: &mut [u8], start: usize, end: usize) -> Option<()> {
    let checked_start = start.checked_add(CRC_BYTES)?;
    let crc = crc32(archive.get(checked_start..end)?);
    archive
        .get_mut(start..checked_start)?
        .copy_from_slice(&crc.to_le_bytes());
    Some(())
}

struct Vints<'a>(&'a [u8]);

impl Vints<'_> {
    /// RAR5 stores integers as little-endian groups of seven bits, the top bit of each byte flagging that another follows.
    fn next(&mut self) -> Option<u64> {
        let mut value = 0_u64;
        for (group, &byte) in self.0.iter().take(LONGEST_VINT_BYTES).enumerate() {
            let bits = u64::from(byte & VINT_DATA_MASK);
            let shift = u32::try_from(group).ok()?.checked_mul(VINT_DATA_BITS)?;
            value |= bits
                .checked_shl(shift)
                .filter(|shifted| shifted >> shift == bits)?;
            if byte & VINT_CONTINUES == 0 {
                self.0 = self.0.get(group + 1..)?;
                return Some(value);
            }
        }
        None
    }
}
