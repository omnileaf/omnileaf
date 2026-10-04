//! Finds the Android SDK and NDK where Tauri looks for them, and reads what its tools report.

use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

const ANDROID_HOME: &str = "ANDROID_HOME";
const ANDROID_SDK_ROOT: &str = "ANDROID_SDK_ROOT";
const NDK_HOME: &str = "NDK_HOME";
const EMULATOR_SERIAL_PREFIX: &str = "emulator-";
const MODEL_FIELD: &str = "model:";
const BLUETOOTH_NAME_FIELD: &str = "name:";

pub(crate) const LIST_ATTACHED: &[&str] = &["devices", "-l"];

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Attached {
    pub(crate) serial: String,
    pub(crate) state: AdbState,
    pub(crate) model: Option<String>,
}

impl Attached {
    pub(crate) fn is_emulator(&self) -> bool {
        self.serial.starts_with(EMULATOR_SERIAL_PREFIX)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AdbState {
    Ready,
    Unauthorized,
    Offline,
}

#[derive(Debug)]
pub(crate) struct Toolchain {
    pub(crate) sdk: PathBuf,
    pub(crate) ndk: Option<PathBuf>,
}

impl Toolchain {
    pub(crate) fn locate(env: impl Fn(&str) -> Option<OsString>, os: &str) -> Option<Self> {
        let sdk = sdk_path(&env, os).filter(|sdk| sdk.is_dir())?;
        let ndk = env(NDK_HOME)
            .map(PathBuf::from)
            .or_else(|| newest_ndk(&sdk.join("ndk")))
            .filter(|ndk| ndk.is_dir());
        Some(Self { sdk, ndk })
    }

    pub(crate) fn adb(&self) -> PathBuf {
        self.sdk.join("platform-tools").join("adb")
    }

    pub(crate) fn emulator(&self) -> PathBuf {
        self.sdk.join("emulator").join("emulator")
    }
}

/// Reads `adb devices -l`, one device per line after its header.
pub(crate) fn attached_devices(listing: &str) -> Vec<Attached> {
    listing
        .lines()
        .skip(1)
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?.to_owned();
            let state = AdbState::from_adb(fields.next()?);
            let model = fields
                .find_map(|field| field.strip_prefix(MODEL_FIELD))
                .map(str::to_owned);
            Some(Attached {
                serial,
                state,
                model,
            })
        })
        .collect()
}

impl AdbState {
    fn from_adb(state: &str) -> Self {
        match state {
            "device" => Self::Ready,
            "unauthorized" => Self::Unauthorized,
            _ => Self::Offline,
        }
    }
}

/// Finds the name Tauri matches an Android phone by in `adb shell dumpsys bluetooth_manager`.
pub(crate) fn bluetooth_name(dump: &str) -> Option<&str> {
    dump.lines()
        .find_map(|line| line.trim().strip_prefix(BLUETOOTH_NAME_FIELD))
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

/// Reads `emulator -list-avds`, which can mix its own log lines in with the names.
pub(crate) fn virtual_device_names(listing: &str) -> Vec<&str> {
    listing
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && line.chars().all(is_virtual_device_name_char))
        .collect()
}

fn is_virtual_device_name_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
}

fn sdk_path(env: &impl Fn(&str) -> Option<OsString>, os: &str) -> Option<PathBuf> {
    env(ANDROID_HOME)
        .or_else(|| env(ANDROID_SDK_ROOT))
        .map(PathBuf::from)
        .or_else(|| default_sdk_path(env, os))
}

fn default_sdk_path(env: &impl Fn(&str) -> Option<OsString>, os: &str) -> Option<PathBuf> {
    let (base, below): (&str, &[&str]) = match os {
        "macos" => ("HOME", &["Library", "Android", "sdk"]),
        "windows" => ("LOCALAPPDATA", &["Android", "Sdk"]),
        _ => ("HOME", &["Android", "Sdk"]),
    };
    env(base).map(|base| {
        below
            .iter()
            .fold(PathBuf::from(base), |path, part| path.join(part))
    })
}

fn newest_ndk(versions: &Path) -> Option<PathBuf> {
    let names: Vec<String> = fs::read_dir(versions)
        .ok()?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .collect();
    newest_version(names.iter().map(String::as_str)).map(|name| versions.join(name))
}

fn newest_version<'a>(names: impl Iterator<Item = &'a str>) -> Option<&'a str> {
    names
        .filter_map(|name| version_numbers(name).map(|numbers| (numbers, name)))
        .max()
        .map(|(_, name)| name)
}

fn version_numbers(name: &str) -> Option<Vec<u32>> {
    name.split('.').map(|part| part.parse().ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_with(
        vars: &'static [(&'static str, &'static str)],
    ) -> impl Fn(&str) -> Option<OsString> {
        move |key| {
            vars.iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| OsString::from(value))
        }
    }

    #[test]
    fn uses_android_home_first() {
        let env = env_with(&[
            ("ANDROID_HOME", "/sdk/home"),
            ("ANDROID_SDK_ROOT", "/sdk/root"),
            ("HOME", "/Users/dev"),
        ]);

        assert_eq!(sdk_path(&env, "macos"), Some(PathBuf::from("/sdk/home")));
    }

    #[test]
    fn falls_back_to_the_deprecated_sdk_root() {
        let env = env_with(&[("ANDROID_SDK_ROOT", "/sdk/root"), ("HOME", "/Users/dev")]);

        assert_eq!(sdk_path(&env, "macos"), Some(PathBuf::from("/sdk/root")));
    }

    #[test]
    fn looks_where_android_studio_installs_the_sdk_on_each_os() {
        let env = env_with(&[
            ("HOME", "/home/dev"),
            ("LOCALAPPDATA", r"C:\Users\dev\AppData\Local"),
        ]);

        let found = ["macos", "linux", "windows"].map(|os| sdk_path(&env, os));

        assert_eq!(
            found,
            [
                Some(
                    Path::new("/home/dev")
                        .join("Library")
                        .join("Android")
                        .join("sdk")
                ),
                Some(Path::new("/home/dev").join("Android").join("Sdk")),
                Some(
                    Path::new(r"C:\Users\dev\AppData\Local")
                        .join("Android")
                        .join("Sdk")
                ),
            ]
        );
    }

    #[test]
    fn finds_no_sdk_without_a_home_folder() {
        assert_eq!(sdk_path(&env_with(&[]), "linux"), None);
    }

    #[test]
    fn picks_the_highest_ndk_version_by_number() {
        let names = ["9.9.1", "27.1.12297006", "29.0.13846066", "10.0.0"];

        assert_eq!(newest_version(names.into_iter()), Some("29.0.13846066"));
    }

    #[test]
    fn ignores_folders_that_are_not_versions() {
        let names = [".DS_Store", "27.1.12297006", "side-by-side"];

        assert_eq!(newest_version(names.into_iter()), Some("27.1.12297006"));
    }

    #[test]
    fn reads_virtual_device_names_between_the_emulator_log_lines() {
        let listing = "INFO    | Storing crashdata in: /tmp/android-dev/emu-crash.db\nPixel_10_Pro\nPixel_10_Pro_XL\n\n";

        assert_eq!(
            virtual_device_names(listing),
            ["Pixel_10_Pro", "Pixel_10_Pro_XL"]
        );
    }

    #[test]
    fn reads_each_attached_device_with_its_state_and_model() {
        let listing = "List of devices attached\n\
            46181FDAP00204         device usb:34603008X product:caiman model:Pixel_9_Pro device:caiman transport_id:493\n\
            emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:494\n\
            R5CT10ABCDE            unauthorized usb:1-1 transport_id:3\n\
            \n";

        let attached = attached_devices(listing);

        assert_eq!(
            attached,
            [
                Attached {
                    serial: "46181FDAP00204".to_owned(),
                    state: AdbState::Ready,
                    model: Some("Pixel_9_Pro".to_owned()),
                },
                Attached {
                    serial: "emulator-5554".to_owned(),
                    state: AdbState::Ready,
                    model: Some("sdk_gphone64_arm64".to_owned()),
                },
                Attached {
                    serial: "R5CT10ABCDE".to_owned(),
                    state: AdbState::Unauthorized,
                    model: None,
                },
            ]
        );
    }

    #[test]
    fn treats_an_unfamiliar_adb_state_as_offline() {
        let attached = attached_devices("List of devices attached\nR5CT10ABCDE recovery usb:1-1\n");

        assert_eq!(
            attached.first().map(|device| device.state),
            Some(AdbState::Offline)
        );
    }

    #[test]
    fn tells_emulators_from_phones_by_serial() {
        let attached = attached_devices(
            "List of devices attached\nemulator-5554 device\n46181FDAP00204 device\n",
        );

        let emulators: Vec<bool> = attached.iter().map(Attached::is_emulator).collect();
        assert_eq!(emulators, [true, false]);
    }

    #[test]
    fn finds_the_phone_name_in_the_bluetooth_dump() {
        let dump = "Bluetooth Status\n  enabled: true\n  state: ON\n  address: 00:00:5E:00:53:01\n  name: Pixel 9 Pro\n  time since enabled: 01:02:03\n";

        assert_eq!(bluetooth_name(dump), Some("Pixel 9 Pro"));
    }

    #[test]
    fn finds_no_phone_name_in_an_empty_dump() {
        assert_eq!(bluetooth_name("Bluetooth Status\n  enabled: false\n"), None);
    }
}
