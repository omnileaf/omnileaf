use image_webp::{ColorType as WebpColour, WebPEncoder};
use jpeg_encoder::{ColorType as JpegColour, Encoder as JpegEncoder, SamplingFactor};
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
const FULL_CHROMA_SCAN_GRAIN: u8 = 16;
const SUBSAMPLED_SCAN_GRAIN: u8 = 20;
const WHITE_MARGIN: u32 = 90;
const WHITE: [u8; 3] = [255; 3];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DrawnScan {
    pub width: u16,
    pub height: u16,
    pub seed: u64,
    pub grain: u8,
}

impl DrawnScan {
    pub fn to_jpeg(self, draw: impl Fn(u32, u32) -> [u8; 3]) -> Result<Vec<u8>, FixtureError> {
        self.grained(&draw).to_jpeg(SamplingFactor::R_4_2_0)
    }

    fn grained(self, draw: &impl Fn(u32, u32) -> [u8; 3]) -> RgbImage {
        let Self {
            width,
            height,
            seed,
            grain,
        } = self;
        let width = u32::from(width);
        let darken = move |channel: u8, noise: u8| {
            channel.saturating_sub(noise.checked_rem(grain).unwrap_or(0))
        };
        let pixels = (0..u32::from(height))
            .flat_map(|row| {
                (0..width).flat_map(move |column| {
                    let [red, green, blue, ..] =
                        splitmix64(seed ^ u64::from(row * width + column)).to_le_bytes();
                    let [drawn_red, drawn_green, drawn_blue] = draw(column, row);
                    [
                        darken(drawn_red, red),
                        darken(drawn_green, green),
                        darken(drawn_blue, blue),
                    ]
                })
            })
            .collect();
        RgbImage {
            pixels,
            width,
            height: u32::from(height),
        }
    }
}

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

pub fn page_jpeg(seed: u64, index: u32, shape: PageShape) -> Result<Vec<u8>, FixtureError> {
    let page = RgbImage {
        pixels: page_pixels(seed, index, shape),
        width: shape.width(),
        height: shape.height(),
    };
    page.to_jpeg(SamplingFactor::R_4_4_4)
}

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

pub fn full_chroma_scan_jpeg(seed: u64) -> Result<Vec<u8>, FixtureError> {
    scan_jpeg(seed, FULL_CHROMA_SCAN_GRAIN, SamplingFactor::R_4_4_4)
}

pub fn subsampled_scan_jpeg(seed: u64) -> Result<Vec<u8>, FixtureError> {
    scan_jpeg(seed, SUBSAMPLED_SCAN_GRAIN, SamplingFactor::R_4_2_0)
}

pub fn margined_scan_jpeg(seed: u64) -> Result<Vec<u8>, FixtureError> {
    let ground = tint(seed, 0);
    let (width, height) = (u32::from(SCAN_WIDTH), u32::from(SCAN_HEIGHT));
    let is_margin = |column: u32, row: u32| {
        column < WHITE_MARGIN
            || row < WHITE_MARGIN
            || column >= width - WHITE_MARGIN
            || row >= height - WHITE_MARGIN
    };
    full_size_scan(seed, SUBSAMPLED_SCAN_GRAIN).to_jpeg(|column, row| {
        if is_margin(column, row) {
            WHITE
        } else {
            ground
        }
    })
}

#[must_use]
pub fn incompressible_bytes(seed: u64, length: usize) -> Vec<u8> {
    (0_u64..)
        .flat_map(|block| {
            splitmix64(seed.wrapping_add(block.wrapping_mul(GOLDEN_GAMMA))).to_le_bytes()
        })
        .take(length)
        .collect()
}

fn scan_jpeg(seed: u64, grain: u8, chroma: SamplingFactor) -> Result<Vec<u8>, FixtureError> {
    let ground = tint(seed, 0);
    full_size_scan(seed, grain)
        .grained(&|_, _| ground)
        .to_jpeg(chroma)
}

const fn full_size_scan(seed: u64, grain: u8) -> DrawnScan {
    DrawnScan {
        width: SCAN_WIDTH,
        height: SCAN_HEIGHT,
        seed,
        grain,
    }
}

struct RgbImage {
    pixels: Vec<u8>,
    width: u32,
    height: u32,
}

impl RgbImage {
    fn to_jpeg(&self, chroma: SamplingFactor) -> Result<Vec<u8>, FixtureError> {
        let (width, height) = (self.width, self.height);
        let too_large = |_| FixtureError::JpegSize { width, height };
        let mut bytes = Vec::new();
        let mut encoder = JpegEncoder::new(&mut bytes, JPEG_QUALITY);
        encoder.set_sampling_factor(chroma);
        encoder.encode(
            &self.pixels,
            u16::try_from(width).map_err(too_large)?,
            u16::try_from(height).map_err(too_large)?,
            JpegColour::Rgb,
        )?;
        Ok(bytes)
    }
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
