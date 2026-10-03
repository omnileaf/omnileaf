use std::error::Error;

use crate::{ImageFormat, Size};

#[derive(Debug, thiserror::Error)]
pub enum ImagingError {
    #[error("decode an image in a format this app can't read")]
    Unsupported,
    #[error("decode a {} by {} image, larger than the {limit} pixels allowed", size.width, size.height)]
    TooLarge { size: Size, limit: u64 },
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
    #[error("encode a thumbnail")]
    Encode(#[source] jpeg_encoder::EncodingError),
}
