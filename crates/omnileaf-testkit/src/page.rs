use image_webp::{ColorType as WebpColour, WebPEncoder};
use jpeg_encoder::{ColorType as JpegColour, Encoder as JpegEncoder};
use png::{BitDepth, ColorType, Encoder};

use crate::FixtureError;

const PAGE_WIDTH: u32 = 400;
const PAGE_HEIGHT: u32 = 600;
const BAND_COUNT: u32 = 10;
const INK: [u8; 3] = [28, 27, 24];
const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;
const JPEG_QUALITY: u8 = 90;
const SCAN_WIDTH: u16 = 1800;
const SCAN_HEIGHT: u16 = 2700;
const SCAN_GRAIN: u8 = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PageShape {
    Portrait,
    Spread,
}

impl PageShape {
    #[must_use]
    pub const fn width(self) -> u32 {
        match self {
            Self::Portrait => PAGE_WIDTH,
            Self::Spread => PAGE_WIDTH * 2,
        }
    }

    #[must_use]
    pub const fn height(self) -> u32 {
        PAGE_HEIGHT
    }
}

/// A page tinted by `seed` and `index` with a dark band whose position follows `index`, so every page is distinct and reproducible.
pub fn page_png(seed: u64, index: u32, shape: PageShape) -> Result<Vec<u8>, FixtureError> {
    let pixels = page_pixels(seed, index, shape);
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, shape.width(), shape.height());
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&pixels)?;
    writer.finish()?;
    Ok(bytes)
}

/// The page [`page_png`] draws, as a JPEG.
pub fn page_jpeg(seed: u64, index: u32, shape: PageShape) -> Result<Vec<u8>, FixtureError> {
    let pixels = page_pixels(seed, index, shape);
    encode_jpeg(&pixels, shape.width(), shape.height())
}

/// The page [`page_png`] draws, as a lossless WebP.
pub fn page_webp(seed: u64, index: u32, shape: PageShape) -> Result<Vec<u8>, FixtureError> {
    let pixels = page_pixels(seed, index, shape);
    let mut bytes = Vec::new();
    WebPEncoder::new(&mut bytes).encode(
        &pixels,
        shape.width(),
        shape.height(),
        WebpColour::Rgb8,
    )?;
    Ok(bytes)
}

/// A JPEG the size of a full-resolution comic scan, with enough grain to weigh about the megabyte a typical scanned page does.
pub fn scan_jpeg(seed: u64) -> Result<Vec<u8>, FixtureError> {
    let ground = tint(seed, 0);
    let width = u32::from(SCAN_WIDTH);
    let pixels: Vec<u8> = (0..u32::from(SCAN_HEIGHT))
        .flat_map(|row| {
            (0..width).flat_map(move |column| {
                let [red, green, blue, ..] =
                    splitmix64(seed ^ u64::from(row * width + column)).to_le_bytes();
                let [ground_red, ground_green, ground_blue] = ground;
                [
                    ground_red.saturating_sub(red % SCAN_GRAIN),
                    ground_green.saturating_sub(green % SCAN_GRAIN),
                    ground_blue.saturating_sub(blue % SCAN_GRAIN),
                ]
            })
        })
        .collect();
    encode_jpeg(&pixels, width, u32::from(SCAN_HEIGHT))
}

fn encode_jpeg(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, FixtureError> {
    let too_large = |_| FixtureError::JpegSize { width, height };
    let mut bytes = Vec::new();
    JpegEncoder::new(&mut bytes, JPEG_QUALITY).encode(
        pixels,
        u16::try_from(width).map_err(too_large)?,
        u16::try_from(height).map_err(too_large)?,
        JpegColour::Rgb,
    )?;
    Ok(bytes)
}

fn page_pixels(seed: u64, index: u32, shape: PageShape) -> Vec<u8> {
    let ground = tint(seed, index);
    let band = index % BAND_COUNT;
    let band_height = PAGE_HEIGHT / BAND_COUNT;
    (0..PAGE_HEIGHT)
        .flat_map(|row| {
            let colour = if row / band_height == band {
                INK
            } else {
                ground
            };
            (0..shape.width()).flat_map(move |_| colour)
        })
        .collect()
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
