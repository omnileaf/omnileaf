use crate::{
    ImageFormat, ImagingError, Size, Transcoded,
    decode::{Decoded, Source},
    size::Plan,
    thumbnail::resize,
    transcode::{Layout, Pixels, encode},
};

const JPEG_SCALE_DIVISORS: [u32; 4] = [1, 2, 4, 8];
const SMALLEST_JPEG_SCALE_DIVISOR: u32 = 8;

pub fn shrink_page(page: &[u8], max_pixels: u64) -> Result<Transcoded, ImagingError> {
    let source = Source::probe(page)?;
    let decoded = match source.format {
        ImageFormat::Jpeg => decode_jpeg_within(&source, max_pixels)?,
        ImageFormat::Png | ImageFormat::Webp => source.decode(source.size)?,
    };
    let output = fitted(decoded.size, max_pixels);
    let samples = if output == decoded.size {
        decoded.rgb
    } else {
        let plan = Plan {
            shown_height: decoded.size.height,
            output,
        };
        resize(&decoded, decoded.size, plan)?
    };
    encode(&Pixels {
        size: output,
        layout: Layout::Rgb,
        samples,
    })
}

fn decode_jpeg_within(source: &Source<'_>, max_pixels: u64) -> Result<Decoded, ImagingError> {
    let mut decoded = Err(ImagingError::Unsupported);
    for divisor in JPEG_SCALE_DIVISORS {
        let at_least = Size {
            width: source.size.width.div_ceil(divisor),
            height: source.size.height.div_ceil(divisor),
        };
        if at_least.pixels() > max_pixels && divisor != SMALLEST_JPEG_SCALE_DIVISOR {
            continue;
        }
        decoded = source.decode(at_least);
        if !matches!(decoded, Err(ImagingError::TooLarge { .. })) {
            break;
        }
    }
    decoded
}

fn fitted(size: Size, max_pixels: u64) -> Size {
    if size.pixels() <= max_pixels {
        return size;
    }
    let width = (u64::from(size.width).saturating_mul(max_pixels) / u64::from(size.height))
        .isqrt()
        .max(1);
    let height = (u64::from(size.height) * width / u64::from(size.width))
        .min(max_pixels / width)
        .max(1);
    Size {
        width: u32::try_from(width).unwrap_or(size.width),
        height: u32::try_from(height).unwrap_or(size.height),
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    proptest! {
        #[test]
        fn fits_any_page_within_the_pixels_allowed_without_growing_it(
            width in 1_u32..=65_535,
            height in 1_u32..=65_535,
            max_pixels in 1_u64..=100_000_000,
        ) {
            let size = Size { width, height };

            let output = fitted(size, max_pixels);

            prop_assert!(output.width >= 1 && output.height >= 1);
            prop_assert!(output.width <= width && output.height <= height);
            prop_assert!(output.pixels() <= max_pixels);
        }
    }
}
