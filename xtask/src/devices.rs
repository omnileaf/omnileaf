//! Lists the phones, emulators and Simulators the app can run on.

use std::{ffi::OsStr, fmt, path::Path};

use anyhow::Context;

use crate::{
    android::{self, AdbState, Attached},
    apple,
    process::Machine,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    AndroidDevice,
    AndroidEmulator,
    IosDevice,
    IosSimulator,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum State {
    Ready,
    Off,
    Unauthorized,
    Offline,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Device {
    pub(crate) kind: Kind,
    pub(crate) state: State,
    pub(crate) name: String,
    pub(crate) id: Option<String>,
}

impl Kind {
    pub(crate) fn is_virtual(self) -> bool {
        match self {
            Self::AndroidEmulator | Self::IosSimulator => true,
            Self::AndroidDevice | Self::IosDevice => false,
        }
    }
}

impl Device {
    pub(crate) fn answers_to(&self, chosen: &str) -> bool {
        self.name.eq_ignore_ascii_case(chosen) || self.id.as_deref() == Some(chosen)
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::AndroidDevice => "android device",
            Self::AndroidEmulator => "android emulator",
            Self::IosDevice => "ios device",
            Self::IosSimulator => "ios simulator",
        })
    }
}

impl fmt::Display for State {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Ready => "ready",
            Self::Off => "off",
            Self::Unauthorized => "unauthorized",
            Self::Offline => "offline",
        })
    }
}

const MACOS: &str = "macos";
const XCRUN: &str = "xcrun";
const LIST_VIRTUAL_DEVICES: &[&str] = &["-list-avds"];
const AVD_NAME: &[&str] = &["emu", "avd", "name"];
const BLUETOOTH_DUMP: &[&str] = &["shell", "dumpsys", "bluetooth_manager"];
const COLUMN_GAP: &str = "  ";

pub(crate) fn discover(
    machine: &impl Machine,
    android: Option<&android::Toolchain>,
    os: &str,
) -> anyhow::Result<Vec<Device>> {
    let mut devices = android
        .map(|toolchain| android_devices(machine, toolchain))
        .unwrap_or_default();
    if os == MACOS {
        devices.extend(ios_devices(machine)?);
    }
    Ok(devices)
}

pub(crate) fn android_devices(
    machine: &impl Machine,
    toolchain: &android::Toolchain,
) -> Vec<Device> {
    let adb = toolchain.adb();
    let attached: Vec<Device> = machine
        .stdout_of(adb.as_os_str(), android::LIST_ATTACHED)
        .map(|listing| {
            android::attached_devices(&listing)
                .iter()
                .map(|attached| attached_device(machine, &adb, attached))
                .collect()
        })
        .unwrap_or_default();
    let switched_off: Vec<Device> = machine
        .stdout_of(toolchain.emulator().as_os_str(), LIST_VIRTUAL_DEVICES)
        .map(|listing| {
            android::virtual_device_names(&listing)
                .into_iter()
                .filter(|name| !is_running_emulator(&attached, name))
                .map(|name| Device {
                    kind: Kind::AndroidEmulator,
                    state: State::Off,
                    name: name.to_owned(),
                    id: None,
                })
                .collect()
        })
        .unwrap_or_default();
    attached.into_iter().chain(switched_off).collect()
}

fn is_running_emulator(attached: &[Device], name: &str) -> bool {
    attached
        .iter()
        .any(|device| device.kind == Kind::AndroidEmulator && device.name == name)
}

fn attached_device(machine: &impl Machine, adb: &Path, attached: &Attached) -> Device {
    let state = match attached.state {
        AdbState::Ready => State::Ready,
        AdbState::Unauthorized => State::Unauthorized,
        AdbState::Offline => State::Offline,
    };
    let reported = (state == State::Ready)
        .then(|| reported_name(machine, adb, attached))
        .flatten();
    let name = reported
        .or_else(|| attached.model.as_ref().map(|model| model.replace('_', " ")))
        .unwrap_or_else(|| attached.serial.clone());
    Device {
        kind: if attached.is_emulator() {
            Kind::AndroidEmulator
        } else {
            Kind::AndroidDevice
        },
        state,
        name,
        id: Some(attached.serial.clone()),
    }
}

/// Asks for the name Tauri matches `--android-device` against: the AVD's, or the phone's Bluetooth name.
fn reported_name(machine: &impl Machine, adb: &Path, attached: &Attached) -> Option<String> {
    if attached.is_emulator() {
        let output = adb_on(machine, adb, &attached.serial, AVD_NAME)?;
        output
            .lines()
            .next()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
    } else {
        let dump = adb_on(machine, adb, &attached.serial, BLUETOOTH_DUMP)?;
        android::bluetooth_name(&dump).map(str::to_owned)
    }
}

fn adb_on(machine: &impl Machine, adb: &Path, serial: &str, args: &[&str]) -> Option<String> {
    let args: Vec<&str> = ["-s", serial]
        .into_iter()
        .chain(args.iter().copied())
        .collect();
    machine.stdout_of(adb.as_os_str(), &args)
}

pub(crate) fn ios_devices(machine: &impl Machine) -> anyhow::Result<Vec<Device>> {
    let physical = machine
        .stdout_of(OsStr::new(XCRUN), apple::LIST_DEVICES)
        .map(|listing| apple::physical_ios_devices(&listing))
        .transpose()
        .context("read the iOS devices devicectl lists")?
        .unwrap_or_default()
        .into_iter()
        .map(|device| Device {
            kind: Kind::IosDevice,
            state: if device.is_reachable {
                State::Ready
            } else {
                State::Off
            },
            name: device.name,
            id: Some(device.udid),
        });
    let simulators = machine
        .stdout_of(OsStr::new(XCRUN), apple::LIST_SIMULATORS)
        .map(|listing| apple::ios_simulators(&listing))
        .transpose()
        .context("read the iOS Simulators simctl lists")?
        .unwrap_or_default()
        .into_iter()
        .map(|simulator| Device {
            kind: Kind::IosSimulator,
            state: if simulator.is_booted {
                State::Ready
            } else {
                State::Off
            },
            name: simulator.name,
            id: Some(simulator.udid),
        });
    Ok(physical.chain(simulators).collect())
}

pub(crate) fn render(devices: &[Device]) -> Vec<String> {
    let width_of = |text: fn(&Device) -> String| {
        devices
            .iter()
            .map(|device| text(device).len())
            .max()
            .unwrap_or_default()
    };
    let kind_width = width_of(|device| device.kind.to_string());
    let state_width = width_of(|device| device.state.to_string());
    let name_width = width_of(|device| device.name.clone());
    devices
        .iter()
        .map(|device| {
            format!(
                "{kind:<kind_width$}{COLUMN_GAP}{state:<state_width$}{COLUMN_GAP}{name:<name_width$}{COLUMN_GAP}{id}",
                kind = device.kind.to_string(),
                state = device.state.to_string(),
                name = device.name,
                id = device.id.as_deref().unwrap_or_default(),
            )
            .trim_end()
            .to_owned()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    struct FakeMachine {
        outputs: &'static [(&'static str, &'static str)],
    }

    impl Machine for FakeMachine {
        fn stdout_of(&self, program: &OsStr, args: &[&str]) -> Option<String> {
            self.outputs
                .iter()
                .find(|(command, _)| is_running(command, program, args))
                .map(|(_, output)| (*output).to_owned())
        }
    }

    fn is_running(command: &str, program: &OsStr, args: &[&str]) -> bool {
        let mut words = command.split(' ');
        words
            .next()
            .is_some_and(|known| Path::new(known) == Path::new(program))
            && words.eq(args.iter().copied())
    }

    fn toolchain() -> android::Toolchain {
        android::Toolchain {
            sdk: PathBuf::from("/sdk"),
            ndk: None,
        }
    }

    const ANDROID: &[(&str, &str)] = &[
        (
            "/sdk/platform-tools/adb devices -l",
            "List of devices attached\n\
             46181FDAP00204 device usb:34603008X model:Pixel_9_Pro transport_id:493\n\
             emulator-5554 device model:sdk_gphone64_arm64 transport_id:494\n\
             R5CT10ABCDE unauthorized usb:1-1 transport_id:3\n",
        ),
        (
            "/sdk/platform-tools/adb -s 46181FDAP00204 shell dumpsys bluetooth_manager",
            "Bluetooth Status\n  enabled: true\n  name: Test Pixel\n",
        ),
        (
            "/sdk/platform-tools/adb -s emulator-5554 emu avd name",
            "Pixel_10_Pro\r\nOK\r\n",
        ),
        (
            "/sdk/emulator/emulator -list-avds",
            "Pixel_10_Pro\nPixel_10_Pro_XL\n",
        ),
    ];

    fn device(kind: Kind, state: State, name: &str, id: Option<&str>) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: id.map(str::to_owned),
        }
    }

    #[test]
    fn lists_attached_android_devices_then_the_emulators_that_are_off() {
        let machine = FakeMachine { outputs: ANDROID };

        let devices = discover(&machine, Some(&toolchain()), "linux").unwrap();

        assert_eq!(
            devices,
            [
                device(
                    Kind::AndroidDevice,
                    State::Ready,
                    "Test Pixel",
                    Some("46181FDAP00204")
                ),
                device(
                    Kind::AndroidEmulator,
                    State::Ready,
                    "Pixel_10_Pro",
                    Some("emulator-5554")
                ),
                device(
                    Kind::AndroidDevice,
                    State::Unauthorized,
                    "R5CT10ABCDE",
                    Some("R5CT10ABCDE")
                ),
                device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL", None),
            ]
        );
    }

    #[test]
    fn names_a_phone_by_its_model_when_bluetooth_has_no_name() {
        let machine = FakeMachine {
            outputs: &[(
                "/sdk/platform-tools/adb devices -l",
                "List of devices attached\n46181FDAP00204 device model:Pixel_9_Pro\n",
            )],
        };

        let devices = discover(&machine, Some(&toolchain()), "linux").unwrap();

        assert_eq!(
            devices,
            [device(
                Kind::AndroidDevice,
                State::Ready,
                "Pixel 9 Pro",
                Some("46181FDAP00204")
            )]
        );
    }

    #[test]
    fn lists_ios_devices_and_simulators_on_a_mac() {
        let machine = FakeMachine {
            outputs: &[
                (
                    "xcrun devicectl list devices --json-output - --quiet",
                    r#"{"result":{"devices":[{
                        "connectionProperties":{"transportType":"wired"},
                        "deviceProperties":{"name":"Test iPhone"},
                        "hardwareProperties":{"platform":"iOS","reality":"physical","udid":"00008140-000A1B2C3D4E5F60"}
                    }]}}"#,
                ),
                (
                    "xcrun simctl list devices available --json",
                    r#"{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-27-0":[
                        {"udid":"75BD17D7-0A6C-48A1-9768-568ACF690500","state":"Shutdown","name":"iPhone 18 Pro"},
                        {"udid":"2AD917AF-392E-4478-8CF1-D866F1DDDCE6","state":"Booted","name":"iPhone 18 Pro Max"}
                    ]}}"#,
                ),
            ],
        };

        let devices = discover(&machine, None, "macos").unwrap();

        assert_eq!(
            devices,
            [
                device(
                    Kind::IosDevice,
                    State::Ready,
                    "Test iPhone",
                    Some("00008140-000A1B2C3D4E5F60")
                ),
                device(
                    Kind::IosSimulator,
                    State::Off,
                    "iPhone 18 Pro",
                    Some("75BD17D7-0A6C-48A1-9768-568ACF690500")
                ),
                device(
                    Kind::IosSimulator,
                    State::Ready,
                    "iPhone 18 Pro Max",
                    Some("2AD917AF-392E-4478-8CF1-D866F1DDDCE6")
                ),
            ]
        );
    }

    #[test]
    fn looks_for_ios_devices_only_on_a_mac() {
        let machine = FakeMachine { outputs: &[] };

        let devices = discover(&machine, None, "linux").unwrap();

        assert!(devices.is_empty());
    }

    #[test]
    fn reports_a_simulator_listing_it_cannot_read() {
        let machine = FakeMachine {
            outputs: &[("xcrun simctl list devices available --json", "not json")],
        };

        assert!(discover(&machine, None, "macos").is_err());
    }

    #[test]
    fn lines_up_the_columns_under_the_longest_name() {
        let devices = [
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL", None),
            device(
                Kind::IosSimulator,
                State::Ready,
                "iPhone 18 Pro",
                Some("2AD917AF"),
            ),
        ];

        let lines = render(&devices);

        assert_eq!(
            lines,
            [
                "android emulator  off    Pixel_10_Pro_XL",
                "ios simulator     ready  iPhone 18 Pro    2AD917AF",
            ]
        );
    }
}
