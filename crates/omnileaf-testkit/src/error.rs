use std::{io, path::PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum FixtureError {
    #[error("write {}", path.display())]
    Write { path: PathBuf, source: io::Error },
    #[error("encode a page")]
    Page(#[from] png::EncodingError),
    #[error("encode a {width} by {height} page as a JPEG, larger than the format allows")]
    JpegSize { width: u32, height: u32 },
    #[error("encode a page as a JPEG")]
    Jpeg(#[from] jpeg_encoder::EncodingError),
    #[error("encode a page as a WebP")]
    Webp(#[from] image_webp::EncodingError),
    #[error("build an archive")]
    Archive(#[from] zip::result::ZipError),
}
