use std::{
    error::Error,
    io::Cursor,
    panic::{self, AssertUnwindSafe},
};

use image_webp::WebPDecoder;
use jpeg_encoder::{ColorType as JpegColour, Encoder as JpegEncoder};
use jxl_oxide::{AllocTracker, JxlImage, PixelFormat};
use png::{BitDepth, ColorType as PngColour, Encoder as PngEncoder};

use crate::{
    ImagingError, PageFormat, Size,
    decode::{MAX_DECODED_BYTES, WEBP_WORKING_BYTES_PER_PIXEL, as_u64, ensure_within_budget},
    page_size,
};

const JPEG_QUALITY: u8 = 90;
const FIRST_FRAME: usize = 0;
const MOST_CHANNELS: u64 = 4;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transcoded {
    pub format: PageFormat,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Layout {
    Grey,
    GreyAlpha,
    Rgb,
    Rgba,
}

pub(crate) struct Pixels {
    pub(crate) size: Size,
    pub(crate) layout: Layout,
    pub(crate) samples: Vec<u8>,
}

pub fn transcode(page: &[u8]) -> Result<Transcoded, ImagingError> {
    let format = PageFormat::sniff(page).ok_or(ImagingError::Unsupported)?;
    let decode = match format {
        PageFormat::Webp => decode_webp,
        PageFormat::Jxl => decode_jxl,
        PageFormat::Jpeg
        | PageFormat::Png
        | PageFormat::Gif
        | PageFormat::Bmp
        | PageFormat::Avif => return Err(ImagingError::NotTranscodable { format }),
    };
    let pixels = panic::catch_unwind(AssertUnwindSafe(|| decode(page)))
        .unwrap_or(Err(ImagingError::DamagedPage { format }))?;
    encode(&pixels)
}

fn decoder_failed<E: Into<Box<dyn Error + Send + Sync>>>(
    format: PageFormat,
) -> impl FnOnce(E) -> ImagingError {
    move |source| ImagingError::Transcode {
        format,
        source: source.into(),
    }
}

fn decode_webp(page: &[u8]) -> Result<Pixels, ImagingError> {
    const FORMAT: PageFormat = PageFormat::Webp;
    let mut decoder = WebPDecoder::new(Cursor::new(page)).map_err(decoder_failed(FORMAT))?;
    decoder.set_memory_limit(usize::try_from(MAX_DECODED_BYTES).unwrap_or(usize::MAX));
    let (width, height) = decoder.dimensions();
    let size = Size { width, height };
    let length = decoder.output_buffer_size().map_or(u64::MAX, as_u64);
    let working_bytes = size.pixels().saturating_mul(WEBP_WORKING_BYTES_PER_PIXEL);
    ensure_within_budget(size, length.saturating_add(working_bytes))?;
    let layout = if decoder.has_alpha() {
        Layout::Rgba
    } else {
        Layout::Rgb
    };
    let mut samples = vec![0; usize::try_from(length).map_err(decoder_failed(FORMAT))?];
    decoder
        .read_image(&mut samples)
        .map_err(decoder_failed(FORMAT))?;
    Ok(Pixels {
        size,
        layout,
        samples,
    })
}

fn decode_jxl(page: &[u8]) -> Result<Pixels, ImagingError> {
    const FORMAT: PageFormat = PageFormat::Jxl;
    let size = page_size(page)?;
    let output_bytes = size.pixels().saturating_mul(MOST_CHANNELS);
    ensure_within_budget(size, output_bytes)?;
    let decoding_bytes = MAX_DECODED_BYTES.saturating_sub(output_bytes);
    let image = JxlImage::builder()
        .alloc_tracker(AllocTracker::with_limit(
            usize::try_from(decoding_bytes).unwrap_or(usize::MAX),
        ))
        .read(Cursor::new(page))
        .map_err(decoder_failed(FORMAT))?;
    let layout = match image.pixel_format() {
        PixelFormat::Gray => Layout::Grey,
        PixelFormat::Graya => Layout::GreyAlpha,
        PixelFormat::Rgb => Layout::Rgb,
        PixelFormat::Rgba => Layout::Rgba,
        PixelFormat::Cmyk | PixelFormat::Cmyka => return Err(ImagingError::Unsupported),
    };
    let render = image
        .render_frame(FIRST_FRAME)
        .map_err(decoder_failed(FORMAT))?;
    let mut stream = render.stream();
    if usize::try_from(stream.channels()).ok() != Some(layout.channels()) {
        return Err(ImagingError::DamagedPage { format: FORMAT });
    }
    let size = Size {
        width: stream.width(),
        height: stream.height(),
    };
    let length = size.pixels().saturating_mul(as_u64(layout.channels()));
    ensure_within_budget(size, length)?;
    let mut samples = vec![0_u8; usize::try_from(length).map_err(decoder_failed(FORMAT))?];
    stream.write_to_buffer(&mut samples);
    Ok(Pixels {
        size,
        layout,
        samples,
    })
}

pub(crate) fn encode(pixels: &Pixels) -> Result<Transcoded, ImagingError> {
    let jpeg_size = u16::try_from(pixels.size.width)
        .ok()
        .zip(u16::try_from(pixels.size.height).ok());
    match (pixels.layout.jpeg_colour(), jpeg_size) {
        (Some(colour), Some((width, height))) => {
            let mut bytes = Vec::new();
            JpegEncoder::new(&mut bytes, JPEG_QUALITY)
                .encode(&pixels.samples, width, height, colour)
                .map_err(ImagingError::Encode)?;
            Ok(Transcoded {
                format: PageFormat::Jpeg,
                bytes,
            })
        }
        _ => encode_png(pixels).map_err(ImagingError::EncodePng),
    }
}

fn encode_png(pixels: &Pixels) -> Result<Transcoded, png::EncodingError> {
    let mut bytes = Vec::new();
    let mut encoder = PngEncoder::new(&mut bytes, pixels.size.width, pixels.size.height);
    encoder.set_color(pixels.layout.png_colour());
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&pixels.samples)?;
    writer.finish()?;
    Ok(Transcoded {
        format: PageFormat::Png,
        bytes,
    })
}

impl Layout {
    const fn channels(self) -> usize {
        match self {
            Self::Grey => 1,
            Self::GreyAlpha => 2,
            Self::Rgb => 3,
            Self::Rgba => 4,
        }
    }

    /// None when the layout has transparency, which a JPEG can't keep.
    const fn jpeg_colour(self) -> Option<JpegColour> {
        match self {
            Self::Grey => Some(JpegColour::Luma),
            Self::Rgb => Some(JpegColour::Rgb),
            Self::GreyAlpha | Self::Rgba => None,
        }
    }

    const fn png_colour(self) -> PngColour {
        match self {
            Self::Grey => PngColour::Grayscale,
            Self::GreyAlpha => PngColour::GrayscaleAlpha,
            Self::Rgb => PngColour::Rgb,
            Self::Rgba => PngColour::Rgba,
        }
    }
}
