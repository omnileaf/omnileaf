use png::{BitDepth, ColorType, Encoder};

use crate::FixtureError;

const PAGE_WIDTH: u32 = 400;
const PAGE_HEIGHT: u32 = 600;
const BAND_COUNT: u32 = 10;
const INK: [u8; 3] = [28, 27, 24];
const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PageShape {
    Portrait,
    Spread,
}

impl PageShape {
    const fn width(self) -> u32 {
        match self {
            Self::Portrait => PAGE_WIDTH,
            Self::Spread => PAGE_WIDTH * 2,
        }
    }
}

/// A page tinted by `seed` and `index` with a dark band whose position follows `index`, so every page is distinct and reproducible.
pub fn page_png(seed: u64, index: u32, shape: PageShape) -> Result<Vec<u8>, FixtureError> {
    let width = shape.width();
    let ground = tint(seed, index);
    let band = index % BAND_COUNT;
    let band_height = PAGE_HEIGHT / BAND_COUNT;
    let pixels: Vec<u8> = (0..PAGE_HEIGHT)
        .flat_map(|row| {
            let colour = if row / band_height == band {
                INK
            } else {
                ground
            };
            (0..width).flat_map(move |_| colour)
        })
        .collect();

    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, width, PAGE_HEIGHT);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&pixels)?;
    writer.finish()?;
    Ok(bytes)
}

fn tint(seed: u64, index: u32) -> [u8; 3] {
    let [red, green, blue, ..] =
        splitmix64(seed ^ u64::from(index).wrapping_mul(GOLDEN_GAMMA)).to_le_bytes();
    [lighten(red), lighten(green), lighten(blue)]
}

const fn lighten(channel: u8) -> u8 {
    128 + channel / 2
}

const fn splitmix64(value: u64) -> u64 {
    let mut mixed = value.wrapping_add(GOLDEN_GAMMA);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    mixed ^ (mixed >> 31)
}
