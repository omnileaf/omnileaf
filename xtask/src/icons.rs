//! Regenerates the app icons, writing the iOS ones without the alpha channel the App Store rejects.

use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};

use anyhow::Context;
use png::{BitDepth, ColorType, Compression, Decoder, Encoder, OutputInfo};

use crate::process;

const ICON_MANIFEST_FROM_APP: &str = "../branding/icon.json";
const IOS_ICON_SET: &str = "app/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset";
const RGBA_SAMPLES: usize = 4;

pub(crate) fn regenerate(root: &Path) -> anyhow::Result<()> {
    let status = process::command_for("pnpm")
        .args(["--dir", "app", "tauri", "icon", ICON_MANIFEST_FROM_APP])
        .current_dir(root)
        .status()
        .context("run the Tauri icon generator")?;
    anyhow::ensure!(status.success(), "generating the icons failed");
    for icon in ios_icons(root)? {
        let png = fs::read(&icon).with_context(|| format!("read {}", icon.display()))?;
        if has_alpha_channel(&png)? {
            fs::write(&icon, without_alpha_channel(&png)?)
                .with_context(|| format!("write {}", icon.display()))?;
        }
    }
    Ok(())
}

fn ios_icons(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let set = root.join(IOS_ICON_SET);
    let mut icons = Vec::new();
    for entry in fs::read_dir(&set).with_context(|| format!("list {}", set.display()))? {
        let path = entry?.path();
        if path.extension().is_some_and(|extension| extension == "png") {
            icons.push(path);
        }
    }
    icons.sort();
    Ok(icons)
}

fn has_alpha_channel(png: &[u8]) -> anyhow::Result<bool> {
    let reader = Decoder::new(Cursor::new(png))
        .read_info()
        .context("read the image header")?;
    Ok(matches!(
        reader.info().color_type,
        ColorType::Rgba | ColorType::GrayscaleAlpha
    ))
}

fn without_alpha_channel(png: &[u8]) -> anyhow::Result<Vec<u8>> {
    let (frame, rgba) = decode_rgba8(png)?;
    let (pixels, _) = rgba.as_chunks::<RGBA_SAMPLES>();
    let rgb: Vec<u8> = pixels
        .iter()
        .flat_map(|&[red, green, blue, _alpha]| [red, green, blue])
        .collect();
    encode_rgb8(&frame, &rgb)
}

fn decode_rgba8(png: &[u8]) -> anyhow::Result<(OutputInfo, Vec<u8>)> {
    let mut reader = Decoder::new(Cursor::new(png))
        .read_info()
        .context("read the image header")?;
    let size = reader
        .output_buffer_size()
        .context("the image is too large")?;
    let mut samples = vec![0; size];
    let frame = reader
        .next_frame(&mut samples)
        .context("decode the image")?;
    anyhow::ensure!(
        frame.color_type == ColorType::Rgba && frame.bit_depth == BitDepth::Eight,
        "expected an 8-bit RGBA image, found {:?} at {:?}",
        frame.color_type,
        frame.bit_depth
    );
    samples.truncate(frame.buffer_size());
    Ok((frame, samples))
}

fn encode_rgb8(frame: &OutputInfo, samples: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut png = Vec::new();
    let mut encoder = Encoder::new(&mut png, frame.width, frame.height);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_compression(Compression::High);
    let mut writer = encoder.write_header().context("write the image header")?;
    writer
        .write_image_data(samples)
        .context("write the pixels")?;
    writer.finish().context("finish the image")?;
    Ok(png)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GREEN_AND_ALMOST_OPAQUE_WHITE: [u8; 8] = [47, 111, 79, 255, 255, 255, 255, 254];

    fn encoded(color: ColorType, pixels: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut encoder = Encoder::new(&mut bytes, 2, 1);
        encoder.set_color(color);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(pixels).unwrap();
        writer.finish().unwrap();
        bytes
    }

    fn decoded(png: &[u8]) -> (ColorType, Vec<u8>) {
        let mut reader = Decoder::new(Cursor::new(png)).read_info().unwrap();
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let frame = reader.next_frame(&mut pixels).unwrap();
        pixels.truncate(frame.buffer_size());
        (frame.color_type, pixels)
    }

    #[test]
    fn reports_the_alpha_channel_of_an_rgba_image() {
        let png = encoded(ColorType::Rgba, &GREEN_AND_ALMOST_OPAQUE_WHITE);

        let found = has_alpha_channel(&png).unwrap();

        assert!(found);
    }

    #[test]
    fn reports_no_alpha_channel_in_an_rgb_image() {
        let png = encoded(ColorType::Rgb, &[47, 111, 79, 255, 255, 255]);

        let found = has_alpha_channel(&png).unwrap();

        assert!(!found);
    }

    #[test]
    fn drops_the_alpha_channel_and_keeps_the_colours() {
        let png = encoded(ColorType::Rgba, &GREEN_AND_ALMOST_OPAQUE_WHITE);

        let opaque = without_alpha_channel(&png).unwrap();

        assert_eq!(
            decoded(&opaque),
            (ColorType::Rgb, vec![47, 111, 79, 255, 255, 255])
        );
    }
}
