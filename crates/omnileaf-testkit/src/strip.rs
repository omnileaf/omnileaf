use jpeg_encoder::{Encoder, ImageBuffer, JpegColorType, SamplingFactor};

use crate::FixtureError;

const JPEG_QUALITY: u8 = 80;
const BAND_ROWS: u16 = 600;
const NEUTRAL_CHROMA: u8 = 128;
const PAPER_LUMA: u8 = 235;
const INK_LUMA: u8 = 40;

/// A colour JPEG strip `width` by `height` in bands of paper and ink, as a long webtoon page is, encoded row by row so its pixels are never all held at once.
pub fn strip_jpeg(width: u16, height: u16) -> Result<Vec<u8>, FixtureError> {
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, JPEG_QUALITY);
    encoder.set_sampling_factor(SamplingFactor::R_4_2_0);
    encoder.encode_image(BandedStrip { width, height })?;
    Ok(bytes)
}

struct BandedStrip {
    width: u16,
    height: u16,
}

impl ImageBuffer for BandedStrip {
    fn get_jpeg_color_type(&self) -> JpegColorType {
        JpegColorType::Ycbcr
    }

    fn width(&self) -> u16 {
        self.width
    }

    fn height(&self) -> u16 {
        self.height
    }

    fn fill_buffers(&self, y: u16, buffers: &mut [Vec<u8>; 4]) {
        let luma = if (y / BAND_ROWS).is_multiple_of(2) {
            PAPER_LUMA
        } else {
            INK_LUMA
        };
        let [luma_row, blue_row, red_row, _] = buffers;
        for _ in 0..self.width {
            luma_row.push(luma);
            blue_row.push(NEUTRAL_CHROMA);
            red_row.push(NEUTRAL_CHROMA);
        }
    }
}
