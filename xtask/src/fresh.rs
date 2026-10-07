//! Removes the app from a phone, emulator or Simulator so `dev --fresh` starts it with no data.

use std::{
    env,
    ffi::OsStr,
    fmt, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;
use serde::Deserialize;

use crate::{
    android,
    dev::{Devices, Platform},
    devices::{self, Device, Kind, State},
    process::{Machine, Process},
    test_device::{self, NoTestDevice, Pick},
};

const TAURI_CONFIG: &str = "app/src-tauri/tauri.conf.json";
const XCRUN: &str = "xcrun";
const DESKTOP_DEV_DATA: &str = "target/dev-data";

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum NoFreshDevice {
    Unavailable(NoTestDevice),
    NoneRunning,
    Ambiguous { running: Vec<String> },
}

impl fmt::Display for NoFreshDevice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unavailable(reason) => reason.fmt(f),
            Self::NoneRunning => f.write_str(
                "--fresh needs a running device, or one named with --android-device or --ios-device",
            ),
            Self::Ambiguous { running } => write!(
                f,
                "{} are running; name the one --fresh clears with --android-device or --ios-device",
                running.join(", ")
            ),
        }
    }
}

impl std::error::Error for NoFreshDevice {}

/// Picks from one platform's devices: the one named, booting it if it's switched off, or else the only running one.
pub(crate) fn pick<'a>(
    devices: &'a [Device],
    chosen: Option<&str>,
) -> Result<Pick<'a>, NoFreshDevice> {
    if let Some(chosen) = chosen {
        let device = devices
            .iter()
            .find(|device| device.answers_to(chosen))
            .ok_or_else(|| {
                NoFreshDevice::Unavailable(NoTestDevice::NotListed {
                    chosen: chosen.to_owned(),
                })
            })?;
        return test_device::usable(device).map_err(NoFreshDevice::Unavailable);
    }
    let running: Vec<&Device> = devices
        .iter()
        .filter(|device| device.state == State::Ready)
        .collect();
    match running.as_slice() {
        [] => Err(NoFreshDevice::NoneRunning),
        [only] => Ok(Pick::Ready(only)),
        several => Err(NoFreshDevice::Ambiguous {
            running: several.iter().map(|device| device.name.clone()).collect(),
        }),
    }
}

pub(crate) fn app_identifier(tauri_config: &str) -> anyhow::Result<String> {
    let config: TauriConfig =
        serde_json::from_str(tauri_config).context("read the identifier in tauri.conf.json")?;
    Ok(config.identifier)
}

#[derive(Deserialize)]
struct TauriConfig {
    identifier: String,
}

/// Removes the app from each phone platform's device; the desktop app gets a new data folder instead.
pub(crate) fn clear(root: &Path, platforms: &[Platform], chosen: &Devices) -> anyhow::Result<()> {
    let config_path = root.join(TAURI_CONFIG);
    let config = fs::read_to_string(&config_path)
        .with_context(|| format!("read {}", config_path.display()))?;
    let identifier = app_identifier(&config)?;
    let machine = Process::in_workspace();
    if platforms.contains(&Platform::Android) {
        let toolchain = android::Toolchain::locate(|key| env::var_os(key), env::consts::OS)
            .context("find the Android SDK; cargo xtask doctor shows how to install it")?;
        clear_android(&machine, &toolchain, chosen.android.as_deref(), &identifier)?;
    }
    if platforms.contains(&Platform::Ios) {
        clear_ios(&machine, chosen.ios.as_deref(), &identifier)?;
    }
    Ok(())
}

#[expect(clippy::print_stdout, reason = "progress output for the developer")]
fn clear_android(
    machine: &impl Machine,
    toolchain: &android::Toolchain,
    chosen: Option<&str>,
    identifier: &str,
) -> anyhow::Result<()> {
    let devices = devices::android_devices(machine, toolchain);
    let serial = match pick(&devices, chosen)? {
        Pick::Ready(device) => device
            .id
            .clone()
            .with_context(|| format!("find the serial of {}", device.name))?,
        Pick::Boot(device) => {
            let serial = test_device::boot_emulator(machine, toolchain, &device.name)?;
            test_device::wait_until_booted(machine, toolchain, &serial)?;
            serial
        }
    };
    let adb = toolchain.adb();
    let is_installed =
        devices::adb_on(machine, &adb, &serial, &["shell", "pm", "path", identifier])
            .is_some_and(|path| !path.trim().is_empty());
    if is_installed {
        println!("==> remove {identifier} from {serial}");
        devices::adb_on(machine, &adb, &serial, &["uninstall", identifier])
            .with_context(|| format!("remove {identifier} from {serial}"))?;
    }
    Ok(())
}

#[expect(clippy::print_stdout, reason = "progress output for the developer")]
fn clear_ios(machine: &impl Machine, chosen: Option<&str>, identifier: &str) -> anyhow::Result<()> {
    let devices = devices::ios_devices(machine)?;
    let (device, needs_boot) = match pick(&devices, chosen)? {
        Pick::Ready(device) => (device, false),
        Pick::Boot(device) => (device, true),
    };
    let udid = device
        .id
        .as_deref()
        .with_context(|| format!("find the udid of {}", device.name))?;
    if needs_boot {
        test_device::boot_simulator(machine, &device.name, udid)?;
    }
    println!("==> remove {identifier} from {}", device.name);
    let removed = match device.kind {
        Kind::IosSimulator => machine.stdout_of(
            OsStr::new(XCRUN),
            &["simctl", "uninstall", udid, identifier],
        ),
        Kind::IosDevice => machine.stdout_of(
            OsStr::new(XCRUN),
            &[
                "devicectl",
                "device",
                "uninstall",
                "app",
                "--device",
                udid,
                identifier,
            ],
        ),
        Kind::AndroidDevice | Kind::AndroidEmulator => {
            anyhow::bail!("{} is not an iOS device", device.name)
        }
    };
    removed.with_context(|| format!("remove {identifier} from {}", device.name))?;
    Ok(())
}

/// Makes the desktop app's data folder for this fresh run and says where it is, leaving the usual one untouched.
#[expect(clippy::print_stdout, reason = "progress output for the developer")]
pub(crate) fn start_desktop_data(root: &Path) -> anyhow::Result<PathBuf> {
    let run = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("read the clock to name this run's data folder")?
        .as_secs();
    let folder = desktop_data_folder(root, run);
    fs::create_dir_all(&folder).with_context(|| format!("create {}", folder.display()))?;
    println!(
        "the desktop app keeps this run's data in {}",
        folder.display()
    );
    Ok(folder)
}

/// A new folder for one fresh run's desktop data under `target`, so the developer's own library stays as it was.
pub(crate) fn desktop_data_folder(root: &Path, run: u64) -> PathBuf {
    root.join(DESKTOP_DEV_DATA).join(run.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::Kind;

    #[test]
    fn keeps_a_fresh_desktop_run_s_data_in_its_own_folder_under_target() {
        let folder = desktop_data_folder(Path::new("/work/omnileaf"), 1_791_262_418);

        assert_eq!(
            folder,
            Path::new("/work/omnileaf/target/dev-data/1791262418")
        );
    }

    fn device(kind: Kind, state: State, name: &str) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: None,
        }
    }

    #[test]
    fn takes_the_only_running_device() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::AndroidDevice, State::Ready, "Test Pixel"),
        ];

        assert_eq!(pick(&devices, None), Ok(Pick::Ready(&devices[1])));
    }

    #[test]
    fn boots_a_named_emulator_or_simulator_that_is_off() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro"),
        ];

        let picked =
            [Some("Pixel_10_Pro_XL"), Some("iPhone 18 Pro")].map(|chosen| pick(&devices, chosen));

        assert_eq!(
            picked,
            [Ok(Pick::Boot(&devices[0])), Ok(Pick::Boot(&devices[1]))]
        );
    }

    #[test]
    fn takes_a_named_phone_that_is_ready() {
        let devices = vec![
            device(Kind::IosDevice, State::Ready, "Test iPhone"),
            device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro"),
        ];

        assert_eq!(
            pick(&devices, Some("Test iPhone")),
            Ok(Pick::Ready(&devices[0]))
        );
    }

    #[test]
    fn refuses_a_named_device_it_cannot_reach() {
        let devices = vec![device(Kind::IosDevice, State::Off, "Test iPhone")];

        let picked = [Some("Test iPhone"), Some("Nexus")].map(|chosen| pick(&devices, chosen));

        assert_eq!(
            picked,
            [
                Err(NoFreshDevice::Unavailable(NoTestDevice::Unusable {
                    name: "Test iPhone".to_owned(),
                    state: State::Off
                })),
                Err(NoFreshDevice::Unavailable(NoTestDevice::NotListed {
                    chosen: "Nexus".to_owned()
                })),
            ]
        );
    }

    #[test]
    fn asks_which_one_when_several_are_running() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Ready, "Pixel_10_Pro"),
            device(Kind::AndroidDevice, State::Ready, "Test Pixel"),
        ];

        assert_eq!(
            pick(&devices, None),
            Err(NoFreshDevice::Ambiguous {
                running: vec!["Pixel_10_Pro".to_owned(), "Test Pixel".to_owned()]
            })
        );
    }

    #[test]
    fn finds_nothing_when_nothing_is_running() {
        let devices = vec![device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL")];

        assert_eq!(pick(&devices, None), Err(NoFreshDevice::NoneRunning));
    }

    #[test]
    fn reads_the_identifier_from_the_tauri_config() {
        let config = r#"{ "productName": "Omnileaf", "identifier": "app.omnileaf", "build": {} }"#;

        assert_eq!(app_identifier(config).unwrap(), "app.omnileaf");
    }

    #[test]
    fn rejects_a_tauri_config_without_an_identifier() {
        assert!(app_identifier(r#"{ "productName": "Omnileaf" }"#).is_err());
    }
}
