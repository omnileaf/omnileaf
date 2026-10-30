const VINT_DATA_BITS: u32 = 7;
const VINT_DATA_MASK: u8 = 0x7F;
const VINT_CONTINUES: u8 = 0x80;
const LONGEST_VINT_BYTES: u32 = 10;

pub(super) struct Fields<'a>(pub(super) &'a [u8]);

impl<'a> Fields<'a> {
    pub(super) fn byte(&mut self) -> Option<u8> {
        let (&first, rest) = self.0.split_first()?;
        self.0 = rest;
        Some(first)
    }

    pub(super) fn take(&mut self, length: usize) -> Option<&'a [u8]> {
        let (taken, rest) = self.0.split_at_checked(length)?;
        self.0 = rest;
        Some(taken)
    }

    pub(super) fn u16(&mut self) -> Option<u16> {
        self.take(2)?.try_into().ok().map(u16::from_le_bytes)
    }

    pub(super) fn u32(&mut self) -> Option<u32> {
        self.take(4)?.try_into().ok().map(u32::from_le_bytes)
    }

    /// RAR5 stores integers as little-endian groups of seven bits, the top bit of each byte flagging that another follows.
    pub(super) fn vint(&mut self) -> Option<u64> {
        let mut value = 0_u64;
        for group in 0..LONGEST_VINT_BYTES {
            let byte = self.byte()?;
            let bits = u64::from(byte & VINT_DATA_MASK);
            let shift = group * VINT_DATA_BITS;
            let shifted = bits
                .checked_shl(shift)
                .filter(|shifted| shifted >> shift == bits)?;
            value |= shifted;
            if byte & VINT_CONTINUES == 0 {
                return Some(value);
            }
        }
        None
    }

    pub(super) fn count(&mut self) -> Option<usize> {
        usize::try_from(self.vint()?)
            .ok()
            .filter(|&count| count <= self.0.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_rar5_vints_of_every_length() {
        let cases: [(&[u8], Option<u64>); 7] = [
            (&[0x05], Some(5)),
            (&[0x80, 0x01], Some(0x80)),
            (&[0x80, 0x80, 0x80, 0x00], Some(0)),
            (
                &[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01],
                Some(u64::MAX),
            ),
            (&[0x80, 0x80], None),
            (
                &[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x02],
                None,
            ),
            (
                &[0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
                None,
            ),
        ];

        let read: Vec<Option<u64>> = cases
            .iter()
            .map(|(bytes, _)| Fields(bytes).vint())
            .collect();

        let expected: Vec<Option<u64>> = cases.iter().map(|&(_, value)| value).collect();
        assert_eq!(read, expected);
    }
}
