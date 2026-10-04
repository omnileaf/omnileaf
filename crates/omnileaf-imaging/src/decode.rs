use std::{
    error::Error,
    io::Cursor,
    panic::{self, AssertUnwindSafe},
};

use image_webp::WebPDecoder;
use jpeg_decoder::{CodingProcess, PixelFormat};
use png::{ColorType, Transformations};

use crate::{ImageFormat, ImagingError, Size};

/// The most memory one decode may take, its decoder's working buffers and the pixels it hands back counted together.
const MAX_DECODED_BYTES: u64 = 256 * 1024 * 1024;
const RGB_BYTES_PER_PIXEL: u64 = 3;
/// Each sample of a progressive JPEG keeps a 16-bit coefficient at full size until its last scan.
const COEFFICIENT_BYTES: u64 = 2;
/// The widest block a JPEG pads its samples to, which its coefficients take room for.
const MAX_JPEG_MCU_EDGE: u64 = 32;
/// The WebP decoder's working buffers per pixel, at most a 32-bit ARGB plane for a lossless image.
const WEBP_WORKING_BYTES_PER_PIXEL: u64 = 4;
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
    /// Reads the image's header, without decoding any pixel.
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
        Ok(Self {
            bytes,
            format,
            size,
        })
    }

    /// Decodes a JPEG at the smallest of its built-in scales still `at_least` as large in one direction; other formats decode in full.
    ///
    /// Refuses an image whose decode would need more memory than allowed, worked out from its header before anything is allocated.
    pub(crate) fn decode(&self, at_least: Size) -> Result<Decoded, ImagingError> {
        let Self {
            bytes,
            format,
            size,
        } = *self;
        guarded(format, || match format {
            ImageFormat::Jpeg => decode_jpeg(bytes, size, at_least),
            ImageFormat::Png => decode_png(bytes, size),
            ImageFormat::Webp => decode_webp(bytes, size),
        })
    }
}

fn ensure_within_budget(size: Size, bytes: u64) -> Result<(), ImagingError> {
    if bytes > MAX_DECODED_BYTES {
        return Err(ImagingError::TooLarge {
            size,
            bytes,
            limit: MAX_DECODED_BYTES,
        });
    }
    Ok(())
}

fn as_u64(length: usize) -> u64 {
    u64::try_from(length).unwrap_or(u64::MAX)
}

fn rgb_bytes(size: Size) -> u64 {
    size.pixels().saturating_mul(RGB_BYTES_PER_PIXEL)
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

fn decode_jpeg(bytes: &[u8], source: Size, at_least: Size) -> Result<Decoded, ImagingError> {
    let failed = |error: jpeg_decoder::Error| undecodable(ImageFormat::Jpeg)(error.into());
    let damaged = || ImagingError::Damaged {
        format: ImageFormat::Jpeg,
    };
    let mut decoder = jpeg_decoder::Decoder::new(bytes);
    let (width, height) = decoder
        .scale(clamped(at_least.width), clamped(at_least.height))
        .map_err(failed)?;
    let scaled = Size {
        width: u32::from(width),
        height: u32::from(height),
    };
    let info = decoder.info().ok_or_else(damaged)?;
    let needed = jpeg_decode_bytes(source, scaled, info);
    ensure_within_budget(source, needed)?;
    decoder.set_max_decoding_buffer_size(usize::try_from(needed).unwrap_or(usize::MAX));
    let pixels = decoder.decode().map_err(failed)?;
    let info = decoder.info().ok_or_else(damaged)?;
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

/// The decoder's planes and its output at the scaled size, the RGB copy of them, and a progressive image's full-size coefficients.
fn jpeg_decode_bytes(source: Size, scaled: Size, info: jpeg_decoder::ImageInfo) -> u64 {
    let samples_per_pixel = as_u64(info.pixel_format.pixel_bytes());
    let scaled_bytes = scaled
        .pixels()
        .saturating_mul(samples_per_pixel.saturating_mul(2))
        .saturating_add(rgb_bytes(scaled));
    let coefficient_bytes = if info.coding_process == CodingProcess::DctProgressive {
        let padded_pixels = u64::from(source.width)
            .next_multiple_of(MAX_JPEG_MCU_EDGE)
            .saturating_mul(u64::from(source.height).next_multiple_of(MAX_JPEG_MCU_EDGE));
        padded_pixels.saturating_mul(samples_per_pixel.saturating_mul(COEFFICIENT_BYTES))
    } else {
        0
    };
    scaled_bytes.saturating_add(coefficient_bytes)
}

fn png_decoder(bytes: &[u8]) -> png::Decoder<Cursor<&[u8]>> {
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: usize::try_from(MAX_DECODED_BYTES).unwrap_or(usize::MAX),
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

fn decode_png(bytes: &[u8], size: Size) -> Result<Decoded, ImagingError> {
    let failed = |error: png::DecodingError| undecodable(ImageFormat::Png)(error.into());
    let mut reader = png_decoder(bytes).read_info().map_err(failed)?;
    let length = reader.output_buffer_size().ok_or(ImagingError::Damaged {
        format: ImageFormat::Png,
    })?;
    let conversion_bytes = match reader.output_color_type().0 {
        ColorType::Rgb => 0,
        ColorType::Rgba | ColorType::Grayscale | ColorType::GrayscaleAlpha | ColorType::Indexed => {
            rgb_bytes(size)
        }
    };
    ensure_within_budget(size, as_u64(length).saturating_add(conversion_bytes))?;
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
    decoder.set_memory_limit(usize::try_from(MAX_DECODED_BYTES).unwrap_or(usize::MAX));
    Ok(decoder)
}

fn webp_size(bytes: &[u8]) -> Result<Size, ImagingError> {
    let (width, height) = webp_decoder(bytes)?.dimensions();
    Ok(Size { width, height })
}

fn decode_webp(bytes: &[u8], size: Size) -> Result<Decoded, ImagingError> {
    let mut decoder = webp_decoder(bytes)?;
    let length = decoder.output_buffer_size().ok_or(ImagingError::Damaged {
        format: ImageFormat::Webp,
    })?;
    let working_bytes = size.pixels().saturating_mul(WEBP_WORKING_BYTES_PER_PIXEL);
    let conversion_bytes = if decoder.has_alpha() {
        rgb_bytes(size)
    } else {
        0
    };
    ensure_within_budget(
        size,
        as_u64(length)
            .saturating_add(working_bytes)
            .saturating_add(conversion_bytes),
    )?;
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

/// Converts each pixel of `CHANNELS` bytes into an RGB copy allocated once at its final size.
fn to_rgb<const CHANNELS: usize>(
    pixels: &[u8],
    convert: impl Fn([u8; CHANNELS]) -> [u8; 3],
) -> Vec<u8> {
    let (whole, _) = pixels.as_chunks::<CHANNELS>();
    let mut rgb = Vec::with_capacity(whole.len().saturating_mul(3));
    for &pixel in whole {
        rgb.extend_from_slice(&convert(pixel));
    }
    rgb
}

fn grey_to_rgb(grey: &[u8]) -> Vec<u8> {
    to_rgb(grey, |[level]| [level; 3])
}

fn grey_alpha_on_white(pixels: &[u8]) -> Vec<u8> {
    to_rgb(pixels, |[level, alpha]| [on_white(level, alpha); 3])
}

fn rgba_on_white(pixels: &[u8]) -> Vec<u8> {
    to_rgb(pixels, |[red, green, blue, alpha]| {
        [red, green, blue].map(|channel| on_white(channel, alpha))
    })
}

fn on_white(channel: u8, alpha: u8) -> u8 {
    let blended = (u32::from(channel) * u32::from(alpha)
        + u32::from(OPAQUE) * u32::from(OPAQUE - alpha)
        + u32::from(OPAQUE) / 2)
        / u32::from(OPAQUE);
    u8::try_from(blended).unwrap_or(OPAQUE)
}

fn cmyk_to_rgb(pixels: &[u8]) -> Vec<u8> {
    to_rgb(pixels, |[cyan, magenta, yellow, black]| {
        [cyan, magenta, yellow].map(|ink| {
            let light = u32::from(OPAQUE - ink) * u32::from(OPAQUE - black);
            u8::try_from(light / u32::from(OPAQUE)).unwrap_or(OPAQUE)
        })
    })
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::grainy_scan_jpeg;

    use super::*;

    #[test]
    fn decodes_a_full_size_jpeg_at_a_quarter_of_its_size_when_a_thumbnail_needs_no_more() {
        let scan = grainy_scan_jpeg(3).unwrap();
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
