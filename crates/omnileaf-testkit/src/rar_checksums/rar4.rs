use crate::rar::crc32;

const BLOCK_PREFIX_BYTES: usize = 7;
const CRC16_BYTES: usize = 2;
const MAIN: u8 = 0x73;
const FILE: u8 = 0x74;
const SERVICE: u8 = 0x7A;
const END: u8 = 0x7B;
const HAS_ADDED_SIZE: u16 = 0x8000;
const FILE_HAS_LARGE_SIZES: u16 = 0x0100;
const HIGH_PACKED_SIZE_AT: usize = 25;

struct Block {
    checked_end: usize,
    next: Option<usize>,
}

pub(super) fn refresh(archive: &mut [u8], first_block: usize) {
    let mut start = first_block;
    while let Some(block) = read_block(archive, start) {
        if write_crc16(archive, start, block.checked_end).is_none() {
            return;
        }
        let Some(next) = block.next else { return };
        start = next;
    }
}

/// RAR 4 checks the end block and the blocks RAR 2 wrote with a CRC that spans the data they add as well as the block.
fn read_block(archive: &[u8], start: usize) -> Option<Block> {
    let fields_start = start.checked_add(BLOCK_PREFIX_BYTES)?;
    let prefix: [u8; BLOCK_PREFIX_BYTES] = archive.get(start..fields_start)?.try_into().ok()?;
    let [_, _, kind, flags_low, flags_high, size_low, size_high] = prefix;
    let flags = u16::from_le_bytes([flags_low, flags_high]);
    let header_size = usize::from(u16::from_le_bytes([size_low, size_high]));
    let header_end = start.checked_add(header_size)?;
    let fields = archive.get(fields_start..header_end)?;
    let block = match kind {
        MAIN => Block {
            checked_end: header_end,
            next: Some(header_end),
        },
        FILE | SERVICE => Block {
            checked_end: header_end,
            next: packed_size(flags, fields).and_then(|size| header_end.checked_add(size)),
        },
        END => Block {
            checked_end: added_data_end(flags, fields, header_end)?,
            next: None,
        },
        _ => {
            let end = added_data_end(flags, fields, header_end)?;
            Block {
                checked_end: end,
                next: Some(end),
            }
        }
    };
    Some(block)
}

fn packed_size(flags: u16, fields: &[u8]) -> Option<usize> {
    let low = u32_at(fields, 0)?;
    let high = if flags & FILE_HAS_LARGE_SIZES == 0 {
        0
    } else {
        u32_at(fields, HIGH_PACKED_SIZE_AT)?
    };
    usize::try_from(u64::from(high) << u32::BITS | u64::from(low)).ok()
}

fn added_data_end(flags: u16, fields: &[u8], header_end: usize) -> Option<usize> {
    if flags & HAS_ADDED_SIZE == 0 {
        return Some(header_end);
    }
    header_end.checked_add(usize::try_from(u32_at(fields, 0)?).ok()?)
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    let field = bytes.get(at..at.checked_add(4)?)?;
    field.try_into().ok().map(u32::from_le_bytes)
}

/// RAR 4 checks each block with the low 16 bits of a CRC32 taken from the block's type byte onwards.
fn write_crc16(archive: &mut [u8], start: usize, checked_end: usize) -> Option<()> {
    let checked_start = start.checked_add(CRC16_BYTES)?;
    let crc = crc32(archive.get(checked_start..checked_end)?);
    let crc16 = u16::try_from(crc & u32::from(u16::MAX)).ok()?;
    archive
        .get_mut(start..checked_start)?
        .copy_from_slice(&crc16.to_le_bytes());
    Some(())
}
