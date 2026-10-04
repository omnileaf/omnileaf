const JPEG_MAGIC: &[u8] = &[0xFF, 0xD8, 0xFF];
const JPEG_END_MARKER: &[u8] = &[0xFF, 0xD9];
const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";
const RIFF_MAGIC: &[u8] = b"RIFF";
const WEBP_MAGIC: &[u8] = b"WEBP";
const RIFF_SIZE_LENGTH: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Webp,
}

impl ImageFormat {
    /// Recognises an image by its first bytes, never its name.
    #[must_use]
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(JPEG_MAGIC) {
            Some(Self::Jpeg)
        } else if bytes.starts_with(PNG_MAGIC) {
            Some(Self::Png)
        } else if is_webp(bytes) {
            Some(Self::Webp)
        } else {
            None
        }
    }
}

/// Whether the bytes run from a JPEG's start marker to its end marker, which a write cut short never does.
#[must_use]
pub fn is_whole_jpeg(bytes: &[u8]) -> bool {
    bytes.starts_with(JPEG_MAGIC) && bytes.ends_with(JPEG_END_MARKER)
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes
        .strip_prefix(RIFF_MAGIC)
        .and_then(|rest| rest.get(RIFF_SIZE_LENGTH..))
        .is_some_and(|rest| rest.starts_with(WEBP_MAGIC))
}
