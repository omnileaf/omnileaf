//! Regenerates the app icons, keeping the macOS one inside Apple's margin and the iOS ones free of the alpha channel the App Store rejects.

use std::{
    env,
    ffi::OsStr,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};

use anyhow::Context;
use png::{BitDepth, ColorType, Compression, Decoder, Encoder, OutputInfo};

use crate::process;

const ICON_MANIFEST_FROM_APP: &str = "../branding/icon.json";
const MACOS_ICON_SOURCE_FROM_APP: &str = "../branding/icon-macos.svg";
const GENERATED_MACOS_ICON: &str = "icon.icns";
const IOS_ICON_SET: &str = "app/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset";
const MACOS_ICON: &str = "app/src-tauri/icons/icon.icns";
const RGBA_SAMPLES: usize = 4;

pub(crate) fn regenerate(root: &Path) -> anyhow::Result<()> {
    run_icon_generator(root, &[OsStr::new(ICON_MANIFEST_FROM_APP)])?;
    replace_macos_icon(root)?;
    remove_ios_alpha_channels(root)
}

fn run_icon_generator(root: &Path, args: &[&OsStr]) -> anyhow::Result<()> {
    let status = process::command_for("pnpm")
        .args(["--dir", "app", "tauri", "icon"])
        .args(args)
        .current_dir(root)
        .status()
        .context("run the Tauri icon generator")?;
    anyhow::ensure!(status.success(), "generating the icons failed");
    Ok(())
}

fn replace_macos_icon(root: &Path) -> anyhow::Result<()> {
    let scratch = env::temp_dir().join(format!("omnileaf-macos-icon-{}", std::process::id()));
    let output = scratch.join("icons");
    fs::create_dir_all(&output).with_context(|| format!("create {}", output.display()))?;
    let generated = run_icon_generator(
        root,
        &[
            OsStr::new(MACOS_ICON_SOURCE_FROM_APP),
            OsStr::new("--output"),
            output.as_os_str(),
        ],
    )
    .and_then(|()| {
        fs::copy(output.join(GENERATED_MACOS_ICON), root.join(MACOS_ICON))
            .context("copy the macOS icon")
    });
    let removed =
        fs::remove_dir_all(&scratch).with_context(|| format!("remove {}", scratch.display()));
    generated.and(removed)
}

fn remove_ios_alpha_channels(root: &Path) -> anyhow::Result<()> {
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
    use crate::workspace;

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

    const MACOS_ICON_SIZE: usize = 1024;
    const APPLE_MARGIN: usize = 100;
    const ICNS_HEADER_LENGTH: usize = 8;
    const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

    fn largest_rgba_image_in_icns(icns: &[u8]) -> (usize, Vec<u8>) {
        let mut largest = (0, Vec::new());
        let mut offset = ICNS_HEADER_LENGTH;
        while offset < icns.len() {
            let length_bytes = icns[offset + 4..offset + ICNS_HEADER_LENGTH]
                .try_into()
                .unwrap();
            let length = usize::try_from(u32::from_be_bytes(length_bytes)).unwrap();
            let entry = &icns[offset + ICNS_HEADER_LENGTH..offset + length];
            if entry.starts_with(PNG_SIGNATURE) {
                let (frame, rgba) = decode_rgba8(entry).unwrap();
                let width = usize::try_from(frame.width).unwrap();
                if width > largest.0 {
                    largest = (width, rgba);
                }
            }
            offset += length;
        }
        largest
    }

    fn alpha_at(rgba: &[u8], width: usize, (x, y): (usize, usize)) -> u8 {
        rgba[(y * width + x) * RGBA_SAMPLES + RGBA_SAMPLES - 1]
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

    #[test]
    fn committed_macos_icon_leaves_apples_margin_around_the_tile() {
        let icns = fs::read(workspace::root().join(MACOS_ICON)).unwrap();

        let (width, rgba) = largest_rgba_image_in_icns(&icns);

        assert_eq!(width, MACOS_ICON_SIZE);
        assert_eq!(
            alpha_at(&rgba, width, (width / 2, APPLE_MARGIN / 2)),
            0,
            "run `cargo xtask icons` to rebuild {MACOS_ICON}"
        );
        assert_eq!(alpha_at(&rgba, width, (width / 2, width / 2)), u8::MAX);
    }

    #[test]
    fn committed_ios_icons_have_no_alpha_channel() {
        let icons = ios_icons(&workspace::root()).unwrap();

        let with_alpha: Vec<&PathBuf> = icons
            .iter()
            .filter(|icon| has_alpha_channel(&fs::read(icon).unwrap()).unwrap())
            .collect();

        assert!(!icons.is_empty());
        assert!(
            with_alpha.is_empty(),
            "run `cargo xtask icons` to rewrite {with_alpha:?}"
        );
    }
}
