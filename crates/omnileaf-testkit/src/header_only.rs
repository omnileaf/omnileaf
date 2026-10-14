//! Images that are only a header, claiming whatever size a test needs without the pixels to fill it.

const VP8L_SIGNATURE: u8 = 0x2F;
const VP8L_LENGTH_BITS: u32 = 14;
const VP8L_ALPHA_BIT: u32 = 1 << (2 * VP8L_LENGTH_BITS);
const WEBP_HEADER_LENGTH: u32 = 12;
const VP8L_PADDING: [u8; 3] = [0; 3];

const JXL_SIGNATURE: [u8; 2] = [0xFF, 0x0A];
/// Picks the size header's widest length, 30 bits holding the length less one.
const JXL_LONGEST_LENGTH: u64 = 0b11;
const JXL_LENGTH_SELECTOR_BITS: u32 = 2;
const JXL_LENGTH_BITS: u32 = 30;
const JXL_NO_RATIO_BITS: u32 = 3;
const JXL_PADDING: [u8; 8] = [0; 8];

/// A lossless WebP's header claiming `width` by `height` with transparency, at most 16384 each way.
#[must_use]
pub fn webp_header_only(width: u32, height: u32) -> Vec<u8> {
    let packed =
        width.saturating_sub(1) | (height.saturating_sub(1) << VP8L_LENGTH_BITS) | VP8L_ALPHA_BIT;
    let payload = [&[VP8L_SIGNATURE][..], &packed.to_le_bytes(), &VP8L_PADDING].concat();
    let chunk_length = u32::try_from(payload.len()).unwrap_or(u32::MAX);
    [
        &b"RIFF"[..],
        &WEBP_HEADER_LENGTH
            .saturating_add(chunk_length)
            .to_le_bytes(),
        b"WEBP",
        b"VP8L",
        &chunk_length.to_le_bytes(),
        &payload,
    ]
    .concat()
}

/// A bare JPEG XL codestream's size header claiming `width` by `height`.
#[must_use]
pub fn jxl_header_only(width: u32, height: u32) -> Vec<u8> {
    let mut bits = 0_u128;
    let mut used = 1;
    for field in [
        (JXL_LONGEST_LENGTH, JXL_LENGTH_SELECTOR_BITS),
        (u64::from(height.saturating_sub(1)), JXL_LENGTH_BITS),
        (0, JXL_NO_RATIO_BITS),
        (JXL_LONGEST_LENGTH, JXL_LENGTH_SELECTOR_BITS),
        (u64::from(width.saturating_sub(1)), JXL_LENGTH_BITS),
    ] {
        let (value, length) = field;
        bits |= u128::from(value) << used;
        used += length;
    }
    [&JXL_SIGNATURE[..], &bits.to_le_bytes(), &JXL_PADDING].concat()
}
