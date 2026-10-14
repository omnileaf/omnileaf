use std::io::ErrorKind;

use imagesize::ImageError;

use crate::{ImagingError, PageFormat, Size};

pub fn page_size(bytes: &[u8]) -> Result<Size, ImagingError> {
    if PageFormat::sniff(bytes).is_none() {
        return Err(ImagingError::Unsupported);
    }
    let read = imagesize::blob_size(bytes).map_err(|error| match error {
        ImageError::IoError(error) if error.kind() == ErrorKind::UnexpectedEof => {
            ImagingError::Truncated
        }
        ImageError::NotSupported => ImagingError::Unsupported,
        ImageError::CorruptedImage | ImageError::IoError(_) => ImagingError::UnreadableHeader,
    })?;
    let size = Size {
        width: u32::try_from(read.width).map_err(|_| ImagingError::UnreadableHeader)?,
        height: u32::try_from(read.height).map_err(|_| ImagingError::UnreadableHeader)?,
    };
    if size.is_empty() {
        return Err(ImagingError::UnreadableHeader);
    }
    Ok(size)
}
