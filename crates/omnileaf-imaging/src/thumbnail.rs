use fast_image_resize::{
    FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
    images::{Image, ImageRef},
};
use jpeg_encoder::{ColorType, Encoder};

use crate::{
    ImagingError, Size,
    decode::{Decoded, Source},
    size::Plan,
};

pub const THUMBNAIL_WIDTH: u32 = 320;
const MAX_HEIGHT_PER_WIDTH: u32 = 2;
const JPEG_QUALITY: u8 = 80;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Thumbnail {
    pub jpeg: Vec<u8>,
    pub size: Size,
}

pub fn thumbnail(image: &[u8], width: u32) -> Result<Thumbnail, ImagingError> {
    let source = Source::probe(image)?;
    let plan = Plan::for_source(source.size, width, MAX_HEIGHT_PER_WIDTH);
    let decoded = source.decode(plan.whole_source_at_output_scale(source.size))?;
    let rgb = resize(&decoded, source.size, plan)?;
    Ok(Thumbnail {
        jpeg: encode(&rgb, plan.output)?,
        size: plan.output,
    })
}

pub(crate) fn resize(decoded: &Decoded, source: Size, plan: Plan) -> Result<Vec<u8>, ImagingError> {
    let failed = |source: Box<dyn std::error::Error + Send + Sync>| ImagingError::Resize {
        size: decoded.size,
        source,
    };
    let shown_rows =
        f64::from(plan.shown_height) * f64::from(decoded.size.height) / f64::from(source.height);
    let pixels = ImageRef::new(
        decoded.size.width,
        decoded.size.height,
        &decoded.rgb,
        PixelType::U8x3,
    )
    .map_err(|error| failed(error.into()))?;
    let mut resized = Image::new(plan.output.width, plan.output.height, PixelType::U8x3);
    let options = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3))
        .crop(0.0, 0.0, f64::from(decoded.size.width), shown_rows);
    Resizer::new()
        .resize(&pixels, &mut resized, &options)
        .map_err(|error| failed(error.into()))?;
    Ok(resized.into_vec())
}

fn encode(rgb: &[u8], size: Size) -> Result<Vec<u8>, ImagingError> {
    let too_large = |_| ImagingError::TooLargeToEncode { size };
    let width = u16::try_from(size.width).map_err(too_large)?;
    let height = u16::try_from(size.height).map_err(too_large)?;
    let mut jpeg = Vec::new();
    Encoder::new(&mut jpeg, JPEG_QUALITY)
        .encode(rgb, width, height, ColorType::Rgb)
        .map_err(ImagingError::Encode)?;
    Ok(jpeg)
}
