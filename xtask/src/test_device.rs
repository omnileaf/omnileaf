use std::{
    ffi::OsStr,
    fmt,
    path::Path,
    process::Stdio,
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;

use crate::{
    android,
    devices::{self, Device, Kind, State},
    process::{Machine, command_for},
};

pub(crate) const ANDROID_SERIAL: &str = "ANDROID_SERIAL";
pub(crate) const SIMULATOR_UDID: &str = "OMNILEAF_SIMULATOR_UDID";

const BOOT_TIMEOUT: Duration = Duration::from_secs(300);
const BOOT_POLL: Duration = Duration::from_secs(2);
const BOOT_COMPLETED: &[&str] = &["shell", "getprop", "sys.boot_completed"];
const CPU_ABI: &[&str] = &["shell", "getprop", "ro.product.cpu.abi"];
const IPHONE: &str = "iPhone";
const XCRUN: &str = "xcrun";

pub(crate) struct AndroidTestDevice {
    pub(crate) serial: String,
    pub(crate) target: android::Target,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Pick<'a> {
    Ready(&'a Device),
    Boot(&'a Device),
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum NoTestDevice {
    NotListed { chosen: String },
    Unusable { name: String, state: State },
    NotASimulator { name: String },
    NoAndroidDevice,
    NoSimulator,
}

impl fmt::Display for NoTestDevice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotListed { chosen } => write!(
                f,
                "nothing answers to {chosen}; cargo xtask devices lists what does"
            ),
            Self::Unusable { name, state } => write!(
                f,
                "{name} is {state}; unlock it and accept the debugging prompt, then try again"
            ),
            Self::NotASimulator { name } => write!(
                f,
                "{name} is an iPhone, and the iOS app tests run on a Simulator"
            ),
            Self::NoAndroidDevice => f.write_str(
                "no Android device or emulator found; connect a phone or create an emulator in Android Studio",
            ),
            Self::NoSimulator => f.write_str(
                "no iOS Simulator found; install a Simulator runtime in Xcode's Components settings",
            ),
        }
    }
}

impl std::error::Error for NoTestDevice {}

/// Prefers the device named, then a running emulator, then a connected phone, then an emulator to boot.
pub(crate) fn pick_android<'a>(
    devices: &'a [Device],
    chosen: Option<&str>,
) -> Result<Pick<'a>, NoTestDevice> {
    let android = || devices.iter().filter(|device| is_android(device.kind));
    if let Some(chosen) = chosen {
        let device = android()
            .find(|device| device.answers_to(chosen))
            .ok_or_else(|| NoTestDevice::NotListed {
                chosen: chosen.to_owned(),
            })?;
        return usable(device);
    }
    let ready =
        |kind: Kind| android().find(|device| device.kind == kind && device.state == State::Ready);
    ready(Kind::AndroidEmulator)
        .or_else(|| ready(Kind::AndroidDevice))
        .map(Pick::Ready)
        .or_else(|| {
            android()
                .find(|device| device.kind == Kind::AndroidEmulator && device.state == State::Off)
                .map(Pick::Boot)
        })
        .ok_or(NoTestDevice::NoAndroidDevice)
}

/// Prefers the Simulator named, then a booted one, then an iPhone Simulator to boot.
pub(crate) fn pick_simulator<'a>(
    devices: &'a [Device],
    chosen: Option<&str>,
) -> Result<Pick<'a>, NoTestDevice> {
    if let Some(chosen) = chosen {
        let device = devices
            .iter()
            .find(|device| is_ios(device.kind) && device.answers_to(chosen))
            .ok_or_else(|| NoTestDevice::NotListed {
                chosen: chosen.to_owned(),
            })?;
        if device.kind != Kind::IosSimulator {
            return Err(NoTestDevice::NotASimulator {
                name: device.name.clone(),
            });
        }
        return usable(device);
    }
    let simulators = || {
        devices
            .iter()
            .filter(|device| device.kind == Kind::IosSimulator)
    };
    simulators()
        .find(|simulator| simulator.state == State::Ready)
        .map(Pick::Ready)
        .or_else(|| {
            simulators()
                .find(|simulator| simulator.name.starts_with(IPHONE))
                .map(Pick::Boot)
        })
        .ok_or(NoTestDevice::NoSimulator)
}

fn is_ios(kind: Kind) -> bool {
    !is_android(kind)
}

fn is_android(kind: Kind) -> bool {
    match kind {
        Kind::AndroidDevice | Kind::AndroidEmulator => true,
        Kind::IosDevice | Kind::IosSimulator => false,
    }
}

pub(crate) fn usable(device: &Device) -> Result<Pick<'_>, NoTestDevice> {
    match device.state {
        State::Ready => Ok(Pick::Ready(device)),
        State::Off if device.kind.is_virtual() => Ok(Pick::Boot(device)),
        State::Off | State::Unauthorized | State::Offline => Err(NoTestDevice::Unusable {
            name: device.name.clone(),
            state: device.state,
        }),
    }
}

/// Boots the emulator it picks and leaves it running afterwards, as Android Studio does.
pub(crate) fn ready_android(
    machine: &impl Machine,
    toolchain: &android::Toolchain,
    chosen: Option<&str>,
) -> anyhow::Result<AndroidTestDevice> {
    let devices = devices::android_devices(machine, toolchain);
    let serial = match pick_android(&devices, chosen)? {
        Pick::Ready(device) => device
            .id
            .clone()
            .with_context(|| format!("find the serial of {}", device.name))?,
        Pick::Boot(device) => boot_emulator(machine, toolchain, &device.name)?,
    };
    wait_until_booted(machine, toolchain, &serial)?;
    let abi = devices::adb_on(machine, &toolchain.adb(), &serial, CPU_ABI)
        .with_context(|| format!("read the ABI of {serial}"))?;
    let target = android::Target::for_abi(&abi)
        .with_context(|| format!("find a Tauri target for {serial}'s {} ABI", abi.trim()))?;
    Ok(AndroidTestDevice { serial, target })
}

/// Boots the Simulator it picks and leaves it running afterwards.
pub(crate) fn ready_simulator(
    machine: &impl Machine,
    chosen: Option<&str>,
) -> anyhow::Result<String> {
    let devices = devices::ios_devices(machine)?;
    let (simulator, needs_boot) = match pick_simulator(&devices, chosen)? {
        Pick::Ready(simulator) => (simulator, false),
        Pick::Boot(simulator) => (simulator, true),
    };
    let udid = simulator
        .id
        .clone()
        .with_context(|| format!("find the udid of {}", simulator.name))?;
    if needs_boot {
        boot_simulator(machine, &simulator.name, &udid)?;
    }
    Ok(udid)
}

#[expect(clippy::print_stdout, reason = "progress output for the developer")]
pub(crate) fn boot_simulator(machine: &impl Machine, name: &str, udid: &str) -> anyhow::Result<()> {
    println!("==> boot the {name} Simulator");
    machine
        .stdout_of(OsStr::new(XCRUN), &["simctl", "boot", udid])
        .with_context(|| format!("boot the {name} Simulator"))?;
    machine
        .stdout_of(OsStr::new(XCRUN), &["simctl", "bootstatus", udid, "-b"])
        .with_context(|| format!("wait for the {name} Simulator to finish booting"))?;
    Ok(())
}

#[expect(clippy::print_stdout, reason = "progress output for the developer")]
pub(crate) fn build_android_app(root: &Path, target: android::Target) -> anyhow::Result<()> {
    println!("==> android build ({})", target.tauri_name());
    let status = command_for("pnpm")
        .args([
            "--dir", "app", "tauri", "android", "build", "--debug", "--apk", "--target",
        ])
        .arg(target.tauri_name())
        .current_dir(root)
        .status()
        .context("start the Android build")?;
    anyhow::ensure!(status.success(), "the Android build failed");
    Ok(())
}

#[expect(clippy::print_stdout, reason = "progress output for the developer")]
pub(crate) fn boot_emulator(
    machine: &impl Machine,
    toolchain: &android::Toolchain,
    name: &str,
) -> anyhow::Result<String> {
    println!("==> boot the {name} emulator");
    let emulator = command_for(toolchain.emulator())
        .args(["-avd", name])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("start the {name} emulator"))?;
    drop(emulator);
    poll_until(|| {
        devices::android_devices(machine, toolchain)
            .into_iter()
            .find(|device| {
                device.kind == Kind::AndroidEmulator
                    && device.state == State::Ready
                    && device.answers_to(name)
            })
            .and_then(|device| device.id)
    })
    .with_context(|| format!("wait for the {name} emulator to connect"))
}

pub(crate) fn wait_until_booted(
    machine: &impl Machine,
    toolchain: &android::Toolchain,
    serial: &str,
) -> anyhow::Result<()> {
    poll_until(|| {
        devices::adb_on(machine, &toolchain.adb(), serial, BOOT_COMPLETED)
            .filter(|completed| completed.trim() == "1")
    })
    .map(drop)
    .with_context(|| format!("wait for {serial} to finish booting"))
}

fn poll_until<T>(mut found: impl FnMut() -> Option<T>) -> anyhow::Result<T> {
    let deadline = Instant::now() + BOOT_TIMEOUT;
    loop {
        if let Some(value) = found() {
            return Ok(value);
        }
        anyhow::ensure!(Instant::now() < deadline, "gave up after {BOOT_TIMEOUT:?}");
        thread::sleep(BOOT_POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(kind: Kind, state: State, name: &str) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: None,
        }
    }

    fn listing() -> Vec<Device> {
        vec![
            device(Kind::AndroidDevice, State::Ready, "Test Pixel"),
            device(Kind::AndroidDevice, State::Unauthorized, "R5CT10ABCDE"),
            device(Kind::AndroidEmulator, State::Ready, "Pixel_10_Pro"),
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro"),
        ]
    }

    #[test]
    fn prefers_a_running_emulator_over_a_phone() {
        let devices = listing();

        let picked = pick_android(&devices, None);

        assert_eq!(picked, Ok(Pick::Ready(&devices[2])));
    }

    #[test]
    fn falls_back_to_a_connected_phone() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
            device(Kind::AndroidDevice, State::Ready, "Test Pixel"),
        ];

        let picked = pick_android(&devices, None);

        assert_eq!(picked, Ok(Pick::Ready(&devices[1])));
    }

    #[test]
    fn boots_an_emulator_when_nothing_is_running() {
        let devices = vec![
            device(Kind::AndroidDevice, State::Unauthorized, "R5CT10ABCDE"),
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
        ];

        let picked = pick_android(&devices, None);

        assert_eq!(picked, Ok(Pick::Boot(&devices[1])));
    }

    #[test]
    fn uses_the_device_named() {
        let devices = listing();

        let picked = [Some("test pixel"), Some("Pixel_10_Pro_XL")]
            .map(|chosen| pick_android(&devices, chosen));

        assert_eq!(
            picked,
            [Ok(Pick::Ready(&devices[0])), Ok(Pick::Boot(&devices[3]))]
        );
    }

    #[test]
    fn refuses_a_named_device_it_cannot_use() {
        let devices = listing();

        let picked = [Some("R5CT10ABCDE"), Some("iPhone 18 Pro"), Some("Nexus")]
            .map(|chosen| pick_android(&devices, chosen));

        assert_eq!(
            picked,
            [
                Err(NoTestDevice::Unusable {
                    name: "R5CT10ABCDE".to_owned(),
                    state: State::Unauthorized
                }),
                Err(NoTestDevice::NotListed {
                    chosen: "iPhone 18 Pro".to_owned()
                }),
                Err(NoTestDevice::NotListed {
                    chosen: "Nexus".to_owned()
                }),
            ]
        );
    }

    #[test]
    fn finds_nothing_without_an_android_device() {
        let devices = vec![device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro")];

        assert_eq!(
            pick_android(&devices, None),
            Err(NoTestDevice::NoAndroidDevice)
        );
    }

    fn ios_listing() -> Vec<Device> {
        vec![
            device(Kind::IosDevice, State::Ready, "Test iPhone"),
            device(Kind::IosSimulator, State::Off, "iPad Air 11-inch (M4)"),
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro"),
            device(Kind::IosSimulator, State::Ready, "iPhone 18 Pro Max"),
            device(Kind::AndroidEmulator, State::Ready, "Pixel_10_Pro"),
        ]
    }

    #[test]
    fn prefers_a_booted_simulator() {
        let devices = ios_listing();

        assert_eq!(pick_simulator(&devices, None), Ok(Pick::Ready(&devices[3])));
    }

    #[test]
    fn boots_an_iphone_simulator_when_none_is_booted() {
        let devices = vec![
            device(Kind::IosSimulator, State::Off, "iPad Air 11-inch (M4)"),
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro"),
        ];

        assert_eq!(pick_simulator(&devices, None), Ok(Pick::Boot(&devices[1])));
    }

    #[test]
    fn uses_the_simulator_named() {
        let devices = ios_listing();

        let picked = [Some("ipad air 11-inch (m4)"), Some("iPhone 18 Pro Max")]
            .map(|chosen| pick_simulator(&devices, chosen));

        assert_eq!(
            picked,
            [Ok(Pick::Boot(&devices[1])), Ok(Pick::Ready(&devices[3]))]
        );
    }

    #[test]
    fn refuses_a_named_iphone_or_android_device() {
        let devices = ios_listing();

        let picked = [Some("Test iPhone"), Some("Pixel_10_Pro")]
            .map(|chosen| pick_simulator(&devices, chosen));

        assert_eq!(
            picked,
            [
                Err(NoTestDevice::NotASimulator {
                    name: "Test iPhone".to_owned()
                }),
                Err(NoTestDevice::NotListed {
                    chosen: "Pixel_10_Pro".to_owned()
                }),
            ]
        );
    }

    #[test]
    fn finds_nothing_without_a_simulator() {
        let devices = vec![device(Kind::IosDevice, State::Ready, "Test iPhone")];

        assert_eq!(
            pick_simulator(&devices, None),
            Err(NoTestDevice::NoSimulator)
        );
    }
}
