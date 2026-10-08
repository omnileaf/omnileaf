use std::{
    fmt, fs,
    path::{Path, PathBuf},
};

use anyhow::Context;

use crate::{
    android,
    devices::{Device, Kind, State},
    process::command_for,
};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum NoScreen {
    NoneRunning,
    NotRunning { chosen: String },
    Ambiguous { running: Vec<String> },
}

impl fmt::Display for NoScreen {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoneRunning => f.write_str("no phone, emulator or Simulator is running"),
            Self::NotRunning { chosen } => write!(
                f,
                "nothing running answers to {chosen}; cargo xtask devices lists what does"
            ),
            Self::Ambiguous { running } => write!(
                f,
                "{} are running; pick one with --device",
                running.join(", ")
            ),
        }
    }
}

impl std::error::Error for NoScreen {}

/// Takes the running device named, or the only running one.
pub(crate) fn pick_running<'a>(
    devices: &'a [Device],
    chosen: Option<&str>,
) -> Result<&'a Device, NoScreen> {
    let running = || devices.iter().filter(|device| device.state == State::Ready);
    if let Some(chosen) = chosen {
        return running()
            .find(|device| device.answers_to(chosen))
            .ok_or_else(|| NoScreen::NotRunning {
                chosen: chosen.to_owned(),
            });
    }
    match running().collect::<Vec<_>>().as_slice() {
        [] => Err(NoScreen::NoneRunning),
        [only] => Ok(only),
        several => Err(NoScreen::Ambiguous {
            running: several.iter().map(|device| device.name.clone()).collect(),
        }),
    }
}

/// Names the file after the device and the second it was taken, keeping only characters safe in any file system.
pub(crate) fn file_name(device: &Device, taken_at_secs: u64) -> String {
    let words: Vec<&str> = device
        .name
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect();
    format!("{}-{taken_at_secs}.png", words.join("-"))
}

/// Writes the screenshot into `folder`, creating it, and returns the file's path.
pub(crate) fn capture(
    device: &Device,
    android: Option<&android::Toolchain>,
    folder: &Path,
    taken_at_secs: u64,
) -> anyhow::Result<PathBuf> {
    fs::create_dir_all(folder).with_context(|| format!("create {}", folder.display()))?;
    let path = folder.join(file_name(device, taken_at_secs));
    let id = device
        .id
        .as_deref()
        .with_context(|| format!("find the id of {}", device.name))?;
    match device.kind {
        Kind::AndroidDevice | Kind::AndroidEmulator => {
            let android = android.context("find the Android SDK for adb")?;
            capture_android(&android.adb(), id, &path)?;
        }
        Kind::IosSimulator => capture_simulator(id, &path)?,
        Kind::IosDevice => anyhow::bail!(
            "{} is an iPhone, and Xcode's tools can only screenshot a Simulator",
            device.name
        ),
    }
    Ok(path)
}

fn capture_android(adb: &Path, serial: &str, path: &Path) -> anyhow::Result<()> {
    let output = command_for(adb)
        .args(["-s", serial, "exec-out", "screencap", "-p"])
        .output()
        .with_context(|| format!("run adb screencap on {serial}"))?;
    anyhow::ensure!(
        output.status.success() && !output.stdout.is_empty(),
        "adb screencap on {serial} failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    fs::write(path, output.stdout).with_context(|| format!("write {}", path.display()))
}

fn capture_simulator(udid: &str, path: &Path) -> anyhow::Result<()> {
    let output = command_for("xcrun")
        .args(["simctl", "io", udid, "screenshot"])
        .arg(path)
        .output()
        .with_context(|| format!("run simctl screenshot on {udid}"))?;
    anyhow::ensure!(
        output.status.success(),
        "simctl screenshot on {udid} failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(kind: Kind, state: State, name: &str) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: Some(format!("{name}-id")),
        }
    }

    fn listing() -> Vec<Device> {
        vec![
            device(Kind::AndroidDevice, State::Unauthorized, "R5CT10ABCDE"),
            device(Kind::AndroidEmulator, State::Ready, "Pixel_10_Pro"),
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro"),
        ]
    }

    #[test]
    fn takes_the_only_running_device() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro"),
        ];

        assert_eq!(pick_running(&devices, None), Ok(&devices[1]));
    }

    #[test]
    fn takes_the_running_device_named() {
        let devices = listing();

        assert_eq!(
            pick_running(&devices, Some("iphone 18 pro")),
            Ok(&devices[3])
        );
    }

    #[test]
    fn asks_which_one_when_several_are_running() {
        let devices = listing();

        assert_eq!(
            pick_running(&devices, None),
            Err(NoScreen::Ambiguous {
                running: vec!["Pixel_10_Pro".to_owned(), "iPhone 18 Pro".to_owned()]
            })
        );
    }

    #[test]
    fn refuses_a_device_that_is_not_running() {
        let devices = listing();

        let picked = [Some("Pixel_10_Pro_XL"), Some("R5CT10ABCDE")]
            .map(|chosen| pick_running(&devices, chosen));

        assert_eq!(
            picked,
            [
                Err(NoScreen::NotRunning {
                    chosen: "Pixel_10_Pro_XL".to_owned()
                }),
                Err(NoScreen::NotRunning {
                    chosen: "R5CT10ABCDE".to_owned()
                }),
            ]
        );
    }

    #[test]
    fn finds_nothing_when_nothing_is_running() {
        let devices = vec![device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL")];

        assert_eq!(pick_running(&devices, None), Err(NoScreen::NoneRunning));
    }

    #[test]
    fn names_the_file_after_the_device_and_time() {
        let names = [
            device(Kind::IosSimulator, State::Ready, "iPad Pro 13-inch (M5)"),
            device(Kind::AndroidDevice, State::Ready, "Someone's Pixel"),
        ]
        .map(|device| file_name(&device, 1_791_108_694));

        assert_eq!(
            names,
            [
                "iPad-Pro-13-inch-M5-1791108694.png",
                "Someone-s-Pixel-1791108694.png",
            ]
        );
    }
}
