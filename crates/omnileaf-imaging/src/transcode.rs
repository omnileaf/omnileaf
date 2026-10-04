use std::{
    error::Error,
    io::Cursor,
    panic::{self, AssertUnwindSafe},
};

use image_webp::WebPDecoder;
use jpeg_encoder::{ColorType as JpegColour, Encoder as JpegEncoder};
use jxl_oxide::{AllocTracker, JxlImage, PixelFormat};
use png::{BitDepth, ColorType as PngColour, Encoder as PngEncoder};

use crate::{ImagingError, PageFormat, Size, decode::MAX_DECODED_BYTES};

const JPEG_QUALITY: u8 = 90;
const FIRST_FRAME: usize = 0;

/// A page in a format every webview shows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transcoded {
    pub format: PageFormat,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Layout {
    Grey,
    GreyAlpha,
    Rgb,
    Rgba,
}

/// Decoded samples, one byte each, row by row in the order their layout names.
struct Pixels {
    size: Size,
    layout: Layout,
    samples: Vec<u8>,
}

/// Turns a WebP or JPEG XL page into a JPEG, or into a PNG when it has transparency or is too large for a JPEG.
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
    let failed = |source: Box<dyn Error + Send + Sync>| ImagingError::Transcode { format, source };
    let pixels = panic::catch_unwind(AssertUnwindSafe(|| decode(page)))
        .unwrap_or_else(|_| Err("the decoder panicked".into()))
        .map_err(failed)?;
    encode(&pixels)
}

fn decode_webp(page: &[u8]) -> Result<Pixels, Box<dyn Error + Send + Sync>> {
    let mut decoder = WebPDecoder::new(Cursor::new(page))?;
    decoder.set_memory_limit(usize::try_from(MAX_DECODED_BYTES)?);
    let (width, height) = decoder.dimensions();
    let layout = if decoder.has_alpha() {
        Layout::Rgba
    } else {
        Layout::Rgb
    };
    let mut samples = vec![
        0;
        decoder
            .output_buffer_size()
            .ok_or("the WebP is too large")?
    ];
    decoder.read_image(&mut samples)?;
    Ok(Pixels {
        size: Size { width, height },
        layout,
        samples,
    })
}

fn decode_jxl(page: &[u8]) -> Result<Pixels, Box<dyn Error + Send + Sync>> {
    let image = JxlImage::builder()
        .alloc_tracker(AllocTracker::with_limit(usize::try_from(
            MAX_DECODED_BYTES,
        )?))
        .read(Cursor::new(page))?;
    let layout = match image.pixel_format() {
        PixelFormat::Gray => Layout::Grey,
        PixelFormat::Graya => Layout::GreyAlpha,
        PixelFormat::Rgb => Layout::Rgb,
        PixelFormat::Rgba => Layout::Rgba,
        PixelFormat::Cmyk | PixelFormat::Cmyka => return Err("the JPEG XL is in CMYK".into()),
    };
    let render = image.render_frame(FIRST_FRAME)?;
    let mut stream = render.stream();
    if usize::try_from(stream.channels())? != layout.channels() {
        return Err("the JPEG XL renders fewer channels than its header gives".into());
    }
    let size = Size {
        width: stream.width(),
        height: stream.height(),
    };
    let length = size
        .pixels()
        .checked_mul(u64::try_from(layout.channels())?)
        .filter(|length| *length <= MAX_DECODED_BYTES)
        .ok_or("the JPEG XL is too large")?;
    let mut samples = vec![0_u8; usize::try_from(length)?];
    stream.write_to_buffer(&mut samples);
    Ok(Pixels {
        size,
        layout,
        samples,
    })
}

fn encode(pixels: &Pixels) -> Result<Transcoded, ImagingError> {
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
