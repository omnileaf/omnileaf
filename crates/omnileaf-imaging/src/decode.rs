use std::{
    error::Error,
    io::Cursor,
    panic::{self, AssertUnwindSafe},
};

use image_webp::WebPDecoder;
use jpeg_decoder::PixelFormat;
use png::{ColorType, Transformations};

use crate::{ImageFormat, ImagingError, Size};

const MAX_PIXELS: u64 = 200_000_000;
const MAX_DECODED_BYTES: usize = 256 * 1024 * 1024;
const OPAQUE: u8 = u8::MAX;

/// An image whose format and size are known from its header, before any pixel is decoded.
pub(crate) struct Source<'bytes> {
    bytes: &'bytes [u8],
    pub(crate) format: ImageFormat,
    pub(crate) size: Size,
}

/// Decoded pixels, three bytes each, red, green and blue, row by row.
pub(crate) struct Decoded {
    pub(crate) size: Size,
    pub(crate) rgb: Vec<u8>,
}

impl<'bytes> Source<'bytes> {
    /// Reads the image's header, refusing an image too large to decode.
    pub(crate) fn probe(bytes: &'bytes [u8]) -> Result<Self, ImagingError> {
        let format = ImageFormat::sniff(bytes).ok_or(ImagingError::Unsupported)?;
        let size = guarded(format, || match format {
            ImageFormat::Jpeg => jpeg_size(bytes),
            ImageFormat::Png => png_size(bytes),
            ImageFormat::Webp => webp_size(bytes),
        })?;
        if size.is_empty() {
            return Err(ImagingError::Damaged { format });
        }
        if size.pixels() > MAX_PIXELS {
            return Err(ImagingError::TooLarge {
                size,
                limit: MAX_PIXELS,
            });
        }
        Ok(Self {
            bytes,
            format,
            size,
        })
    }

    /// Decodes a JPEG at the smallest of its built-in scales still `at_least` as large in one direction; other formats decode in full.
    pub(crate) fn decode(&self, at_least: Size) -> Result<Decoded, ImagingError> {
        let bytes = self.bytes;
        guarded(self.format, || match self.format {
            ImageFormat::Jpeg => decode_jpeg(bytes, at_least),
            ImageFormat::Png => decode_png(bytes),
            ImageFormat::Webp => decode_webp(bytes),
        })
    }
}

/// Turns a decoder's panic on a damaged image into an error, so one bad page never takes the app down.
fn guarded<T>(
    format: ImageFormat,
    decode: impl FnOnce() -> Result<T, ImagingError>,
) -> Result<T, ImagingError> {
    panic::catch_unwind(AssertUnwindSafe(decode)).unwrap_or(Err(ImagingError::Damaged { format }))
}

fn undecodable(format: ImageFormat) -> impl FnOnce(Box<dyn Error + Send + Sync>) -> ImagingError {
    move |source| ImagingError::Undecodable { format, source }
}

fn jpeg_size(bytes: &[u8]) -> Result<Size, ImagingError> {
    let mut decoder = jpeg_decoder::Decoder::new(bytes);
    decoder
        .read_info()
        .map_err(|error| undecodable(ImageFormat::Jpeg)(error.into()))?;
    let info = decoder.info().ok_or(ImagingError::Damaged {
        format: ImageFormat::Jpeg,
    })?;
    Ok(Size {
        width: u32::from(info.width),
        height: u32::from(info.height),
    })
}

fn decode_jpeg(bytes: &[u8], at_least: Size) -> Result<Decoded, ImagingError> {
    let failed = |error: jpeg_decoder::Error| undecodable(ImageFormat::Jpeg)(error.into());
    let mut decoder = jpeg_decoder::Decoder::new(bytes);
    decoder
        .scale(clamped(at_least.width), clamped(at_least.height))
        .map_err(failed)?;
    let pixels = decoder.decode().map_err(failed)?;
    let info = decoder.info().ok_or(ImagingError::Damaged {
        format: ImageFormat::Jpeg,
    })?;
    let rgb = match info.pixel_format {
        PixelFormat::RGB24 => pixels,
        PixelFormat::L8 => grey_to_rgb(&pixels),
        PixelFormat::CMYK32 => cmyk_to_rgb(&pixels),
        PixelFormat::L16 => return Err(ImagingError::Unsupported),
    };
    Ok(Decoded {
        size: Size {
            width: u32::from(info.width),
            height: u32::from(info.height),
        },
        rgb,
    })
}

fn png_decoder(bytes: &[u8]) -> png::Decoder<Cursor<&[u8]>> {
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: MAX_DECODED_BYTES,
        },
    );
    decoder.set_transformations(Transformations::normalize_to_color8());
    decoder
}

fn png_size(bytes: &[u8]) -> Result<Size, ImagingError> {
    let reader = png_decoder(bytes)
        .read_info()
        .map_err(|error| undecodable(ImageFormat::Png)(error.into()))?;
    let info = reader.info();
    Ok(Size {
        width: info.width,
        height: info.height,
    })
}

fn decode_png(bytes: &[u8]) -> Result<Decoded, ImagingError> {
    let failed = |error: png::DecodingError| undecodable(ImageFormat::Png)(error.into());
    let mut reader = png_decoder(bytes).read_info().map_err(failed)?;
    let length = reader.output_buffer_size().ok_or(ImagingError::Damaged {
        format: ImageFormat::Png,
    })?;
    let mut pixels = vec![0; length];
    let frame = reader.next_frame(&mut pixels).map_err(failed)?;
    pixels.truncate(frame.buffer_size());
    let rgb = match frame.color_type {
        ColorType::Rgb => pixels,
        ColorType::Rgba => rgba_on_white(&pixels),
        ColorType::Grayscale => grey_to_rgb(&pixels),
        ColorType::GrayscaleAlpha => grey_alpha_on_white(&pixels),
        ColorType::Indexed => return Err(ImagingError::Unsupported),
    };
    Ok(Decoded {
        size: Size {
            width: frame.width,
            height: frame.height,
        },
        rgb,
    })
}

fn webp_decoder(bytes: &[u8]) -> Result<WebPDecoder<Cursor<&[u8]>>, ImagingError> {
    let mut decoder = WebPDecoder::new(Cursor::new(bytes))
        .map_err(|error| undecodable(ImageFormat::Webp)(error.into()))?;
    decoder.set_memory_limit(MAX_DECODED_BYTES);
    Ok(decoder)
}

fn webp_size(bytes: &[u8]) -> Result<Size, ImagingError> {
    let (width, height) = webp_decoder(bytes)?.dimensions();
    Ok(Size { width, height })
}

fn decode_webp(bytes: &[u8]) -> Result<Decoded, ImagingError> {
    let mut decoder = webp_decoder(bytes)?;
    let length = decoder.output_buffer_size().ok_or(ImagingError::Damaged {
        format: ImageFormat::Webp,
    })?;
    let mut pixels = vec![0; length];
    decoder
        .read_image(&mut pixels)
        .map_err(|error| undecodable(ImageFormat::Webp)(error.into()))?;
    let (width, height) = decoder.dimensions();
    let rgb = if decoder.has_alpha() {
        rgba_on_white(&pixels)
    } else {
        pixels
    };
    Ok(Decoded {
        size: Size { width, height },
        rgb,
    })
}

fn clamped(length: u32) -> u16 {
    u16::try_from(length).unwrap_or(u16::MAX)
}

fn grey_to_rgb(grey: &[u8]) -> Vec<u8> {
    grey.iter().flat_map(|&level| [level; 3]).collect()
}

fn grey_alpha_on_white(pixels: &[u8]) -> Vec<u8> {
    pixels
        .as_chunks::<2>()
        .0
        .iter()
        .flat_map(|&[level, alpha]| [on_white(level, alpha); 3])
        .collect()
}

fn rgba_on_white(pixels: &[u8]) -> Vec<u8> {
    pixels
        .as_chunks::<4>()
        .0
        .iter()
        .flat_map(|&[red, green, blue, alpha]| {
            [red, green, blue].map(|channel| on_white(channel, alpha))
        })
        .collect()
}

fn on_white(channel: u8, alpha: u8) -> u8 {
    let blended = (u32::from(channel) * u32::from(alpha)
        + u32::from(OPAQUE) * u32::from(OPAQUE - alpha)
        + u32::from(OPAQUE) / 2)
        / u32::from(OPAQUE);
    u8::try_from(blended).unwrap_or(OPAQUE)
}

fn cmyk_to_rgb(pixels: &[u8]) -> Vec<u8> {
    pixels
        .as_chunks::<4>()
        .0
        .iter()
        .flat_map(|&[cyan, magenta, yellow, black]| {
            [cyan, magenta, yellow].map(|ink| {
                let light = u32::from(OPAQUE - ink) * u32::from(OPAQUE - black);
                u8::try_from(light / u32::from(OPAQUE)).unwrap_or(OPAQUE)
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::scan_jpeg;

    use super::*;

    #[test]
    fn decodes_a_full_size_jpeg_at_a_quarter_of_its_size_when_a_thumbnail_needs_no_more() {
        let scan = scan_jpeg(3).unwrap();
        let source = Source::probe(&scan).unwrap();

        let decoded = source
            .decode(Size {
                width: 320,
                height: 480,
            })
            .unwrap();

        assert_eq!(
            decoded.size,
            Size {
                width: 450,
                height: 675
            }
        );
    }
}
