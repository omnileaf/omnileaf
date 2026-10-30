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
    #[error("build a 7z archive")]
    SevenZipArchive(#[from] sevenz_rust2::Error),
    #[error("write a RAR 4 header longer than its 16-bit size field allows")]
    RarHeaderTooLong,
    #[error("write RAR5 compression version {version}, wider than its six bits")]
    RarCompressionVersion { version: u8 },
    #[error("write a RAR5 dictionary of {bytes} bytes, which its field can't encode")]
    RarDictionary { bytes: u64 },
    #[error("write RAR folder {name} holding bytes")]
    RarFolderWithBytes { name: String },
}
