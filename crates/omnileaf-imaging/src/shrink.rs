use crate::{
    ImagingError, Size, Transcoded,
    decode::Source,
    size::Plan,
    thumbnail::resize,
    transcode::{Layout, Pixels, encode},
};

/// Shrinks a JPEG, PNG or WebP page to at most `max_pixels`, keeping its shape, within the decode budget; other formats are unsupported.
pub fn shrink_page(page: &[u8], max_pixels: u64) -> Result<Transcoded, ImagingError> {
    let source = Source::probe(page)?;
    let output = fitted(source.size, max_pixels);
    let decoded = source.decode(output)?;
    let plan = Plan {
        shown_height: source.size.height,
        output,
    };
    encode(&Pixels {
        size: output,
        layout: Layout::Rgb,
        samples: resize(&decoded, source.size, plan)?,
    })
}

/// The largest size of the same shape within `max_pixels`, never larger than `size` itself.
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
