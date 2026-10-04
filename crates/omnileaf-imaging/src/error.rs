use std::error::Error;

use crate::{ImageFormat, PageFormat, Size};

#[derive(Debug, thiserror::Error)]
pub enum ImagingError {
    #[error("decode an image in a format this app can't read")]
    Unsupported,
    #[error("decode a {} by {} image, which needs {bytes} bytes, more than the {limit} allowed", size.width, size.height)]
    TooLarge { size: Size, bytes: u64, limit: u64 },
    #[error("decode a {format:?} image")]
    Undecodable {
        format: ImageFormat,
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
    #[error("decode a {format:?} image its decoder gave up on")]
    Damaged { format: ImageFormat },
    #[error("resize a {} by {} image", size.width, size.height)]
    Resize {
        size: Size,
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
    #[error("encode a {} by {} thumbnail, larger than a JPEG can hold", size.width, size.height)]
    TooLargeToEncode { size: Size },
    #[error("encode a JPEG")]
    Encode(#[source] jpeg_encoder::EncodingError),
    #[error("read the size of an image whose header runs past the bytes read")]
    Truncated,
    #[error("read the size of an image whose header is damaged")]
    UnreadableHeader,
    #[error("transcode a page in {format:?}, when only WebP and JPEG XL pages are transcoded")]
    NotTranscodable { format: PageFormat },
    #[error("decode a {format:?} page to transcode it")]
    Transcode {
        format: PageFormat,
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
    #[error("encode a PNG")]
    EncodePng(#[source] png::EncodingError),
}
