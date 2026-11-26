pub(crate) fn saturating_u32(items: usize) -> u32 {
    u32::try_from(items).unwrap_or(u32::MAX)
}
