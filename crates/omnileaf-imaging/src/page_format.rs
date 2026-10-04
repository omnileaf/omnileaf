use imagesize::{Compression, ImageType};

/// The image formats a page may be stored in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PageFormat {
    Jpeg,
    Png,
    Gif,
    Bmp,
    Webp,
    Avif,
    Jxl,
}

impl PageFormat {
    /// Recognises a page by its first bytes, never its name.
    #[must_use]
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        imagesize::image_type(bytes).ok().and_then(Self::of)
    }

    #[must_use]
    pub const fn content_type(self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::Gif => "image/gif",
            Self::Bmp => "image/bmp",
            Self::Webp => "image/webp",
            Self::Avif => "image/avif",
            Self::Jxl => "image/jxl",
        }
    }

    /// None for a kind of image no page is stored as, such as a HEIF that isn't an AVIF.
    pub(crate) fn of(found: ImageType) -> Option<Self> {
        Some(match found {
            ImageType::Jpeg => Self::Jpeg,
            ImageType::Png => Self::Png,
            ImageType::Gif => Self::Gif,
            ImageType::Bmp => Self::Bmp,
            ImageType::Webp => Self::Webp,
            ImageType::Heif(Compression::Av1) => Self::Avif,
            ImageType::Jxl => Self::Jxl,
            _ => return None,
        })
    }
}
