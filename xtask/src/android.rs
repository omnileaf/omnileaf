use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;

pub(crate) const ANDROID_HOME: &str = "ANDROID_HOME";
const ANDROID_SDK_ROOT: &str = "ANDROID_SDK_ROOT";
const NDK_HOME: &str = "NDK_HOME";
const NDK_SOURCE_PROPERTIES: &str = "source.properties";
const PINNED_NDK_FILE: &str = ".android-ndk-version";
const NDK_REVISION_FIELD: &str = "Pkg.Revision";
const EMULATOR_SERIAL_PREFIX: &str = "emulator-";
const MODEL_FIELD: &str = "model:";
const TRANSPORT_FIELD: &str = "transport_id:";
const BLUETOOTH_NAME_FIELD: &str = "name:";

pub(crate) const LIST_ATTACHED: &[&str] = &["devices", "-l"];

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Attached {
    pub(crate) serial: String,
    pub(crate) state: AdbState,
    pub(crate) model: Option<String>,
    /// adb gives a device a new transport id each time it connects again.
    pub(crate) transport: Option<String>,
}

impl Attached {
    pub(crate) fn is_emulator(&self) -> bool {
        self.serial.starts_with(EMULATOR_SERIAL_PREFIX)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Target {
    Aarch64,
    Armv7,
    I686,
    X86_64,
}

impl Target {
    pub(crate) fn for_abi(abi: &str) -> Option<Self> {
        match abi.trim() {
            "arm64-v8a" => Some(Self::Aarch64),
            "armeabi-v7a" => Some(Self::Armv7),
            "x86" => Some(Self::I686),
            "x86_64" => Some(Self::X86_64),
            _ => None,
        }
    }

    pub(crate) fn tauri_name(self) -> &'static str {
        match self {
            Self::Aarch64 => "aarch64",
            Self::Armv7 => "armv7",
            Self::I686 => "i686",
            Self::X86_64 => "x86_64",
        }
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
    pub(crate) ndk: NdkSearch,
}

#[derive(Debug)]
pub(crate) enum NdkSearch {
    Found(Ndk),
    NdkHomeNotAFolder(PathBuf),
    NoneInstalled,
}

#[derive(Debug)]
pub(crate) struct Ndk {
    pub(crate) path: PathBuf,
    pub(crate) revision: Option<String>,
}

impl Toolchain {
    pub(crate) fn locate(env: impl Fn(&str) -> Option<OsString>, os: &str) -> Option<Self> {
        let sdk = sdk_path(&env, os).filter(|sdk| sdk.is_dir())?;
        let ndk = search_ndk(env(NDK_HOME).map(PathBuf::from), &sdk);
        Some(Self { sdk, ndk })
    }

    pub(crate) fn adb(&self) -> PathBuf {
        self.sdk.join("platform-tools").join("adb")
    }

    pub(crate) fn emulator(&self) -> PathBuf {
        self.sdk.join("emulator").join("emulator")
    }
}

/// `adb devices -l` prints a header line before one line per device.
pub(crate) fn attached_devices(listing: &str) -> Vec<Attached> {
    listing
        .lines()
        .skip(1)
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?.to_owned();
            let state = AdbState::from_adb(fields.next()?);
            let details: Vec<&str> = fields.collect();
            let detail = |prefix: &str| {
                details
                    .iter()
                    .find_map(|field| field.strip_prefix(prefix))
                    .map(str::to_owned)
            };
            Some(Attached {
                serial,
                state,
                model: detail(MODEL_FIELD),
                transport: detail(TRANSPORT_FIELD),
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

pub(crate) fn bluetooth_name(dump: &str) -> Option<&str> {
    dump.lines()
        .find_map(|line| {
            let line = line.trim_start();
            let (field, value) = line.split_at_checked(BLUETOOTH_NAME_FIELD.len())?;
            field
                .eq_ignore_ascii_case(BLUETOOTH_NAME_FIELD)
                .then_some(value)
        })
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

/// `emulator -list-avds` can mix its own log lines in with the names.
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

fn search_ndk(ndk_home: Option<PathBuf>, sdk: &Path) -> NdkSearch {
    match ndk_home {
        Some(home) if home.is_dir() => NdkSearch::Found(Ndk::at(home)),
        Some(home) => NdkSearch::NdkHomeNotAFolder(home),
        None => newest_ndk(&sdk.join("ndk"))
            .filter(|ndk| ndk.is_dir())
            .map_or(NdkSearch::NoneInstalled, |path| {
                NdkSearch::Found(Ndk::at(path))
            }),
    }
}

impl Ndk {
    fn at(path: PathBuf) -> Self {
        let revision = fs::read_to_string(path.join(NDK_SOURCE_PROPERTIES))
            .ok()
            .as_deref()
            .and_then(ndk_revision)
            .map(str::to_owned);
        Self { path, revision }
    }
}

pub(crate) fn pinned_ndk(root: &Path) -> anyhow::Result<String> {
    let file = root.join(PINNED_NDK_FILE);
    let contents = fs::read_to_string(&file).with_context(|| format!("read {}", file.display()))?;
    let version = contents.trim();
    anyhow::ensure!(
        !version.is_empty(),
        "{} names no NDK version",
        file.display()
    );
    Ok(version.to_owned())
}

fn ndk_revision(source_properties: &str) -> Option<&str> {
    source_properties
        .lines()
        .filter_map(|line| line.split_once('='))
        .find(|(key, _)| key.trim() == NDK_REVISION_FIELD)
        .map(|(_, value)| value.trim())
        .filter(|revision| !revision.is_empty())
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
    use std::{env, process};

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
    fn reads_the_ndk_revision_from_its_source_properties() {
        let properties = "Pkg.Desc = Android NDK\nPkg.Revision = 30.0.16248370\nPkg.BaseRevision = 30.0.16248370\n";

        assert_eq!(ndk_revision(properties), Some("30.0.16248370"));
    }

    #[test]
    fn finds_no_ndk_revision_without_the_field() {
        let properties = "Pkg.Desc = Android NDK\nPkg.BaseRevision = 30.0.16248370\n";

        assert_eq!(ndk_revision(properties), None);
    }

    fn scratch(name: &str) -> PathBuf {
        let folder = env::temp_dir().join(format!("omnileaf-xtask-{name}-{}", process::id()));
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn reads_the_pinned_ndk_version_without_its_line_break() {
        let root = scratch("pinned-ndk");
        fs::write(root.join(PINNED_NDK_FILE), "30.0.16248370\n").unwrap();

        let pinned = pinned_ndk(&root);

        fs::remove_dir_all(&root).unwrap();
        assert_eq!(pinned.unwrap(), "30.0.16248370");
    }

    #[test]
    fn fails_without_a_pinned_ndk_version_file() {
        let root = scratch("no-pinned-ndk");

        let pinned = pinned_ndk(&root);

        fs::remove_dir_all(&root).unwrap();
        assert!(pinned.is_err());
    }

    #[test]
    fn fails_on_an_empty_pinned_ndk_version_file() {
        let root = scratch("empty-pinned-ndk");
        fs::write(root.join(PINNED_NDK_FILE), "\n").unwrap();

        let pinned = pinned_ndk(&root);

        fs::remove_dir_all(&root).unwrap();
        assert!(pinned.is_err());
    }

    fn install_ndk(folder: &Path, revision: &str) {
        fs::create_dir_all(folder).unwrap();
        fs::write(
            folder.join(NDK_SOURCE_PROPERTIES),
            format!("Pkg.Desc = Android NDK\nPkg.Revision = {revision}\n"),
        )
        .unwrap();
    }

    #[test]
    fn reads_an_ndk_version_from_its_folder() {
        let folder = scratch("ndk-with-version");
        install_ndk(&folder, "30.0.16248370");

        let ndk = Ndk::at(folder.clone());

        fs::remove_dir_all(&folder).unwrap();
        assert_eq!(ndk.revision.as_deref(), Some("30.0.16248370"));
    }

    #[test]
    fn reads_no_version_from_an_ndk_folder_without_source_properties() {
        let folder = scratch("ndk-without-version");

        let ndk = Ndk::at(folder.clone());

        fs::remove_dir_all(&folder).unwrap();
        assert_eq!(ndk.revision, None);
    }

    #[test]
    fn locates_the_newest_ndk_in_the_sdk_with_its_version() {
        let sdk = scratch("sdk-with-ndks");
        install_ndk(&sdk.join("ndk").join("27.1.12297006"), "27.1.12297006");
        install_ndk(&sdk.join("ndk").join("30.0.16248370"), "30.0.16248370");
        let home = sdk.clone().into_os_string();

        let toolchain =
            Toolchain::locate(|key| (key == ANDROID_HOME).then(|| home.clone()), "linux");

        fs::remove_dir_all(&sdk).unwrap();
        let NdkSearch::Found(ndk) = toolchain.unwrap().ndk else {
            panic!("found no NDK in the SDK");
        };
        assert_eq!(ndk.path, sdk.join("ndk").join("30.0.16248370"));
        assert_eq!(ndk.revision.as_deref(), Some("30.0.16248370"));
    }

    #[test]
    fn reports_an_ndk_home_that_is_not_a_folder_without_falling_back_to_the_sdk() {
        let sdk = scratch("sdk-with-stale-ndk-home");
        install_ndk(&sdk.join("ndk").join("30.0.16248370"), "30.0.16248370");
        let stale = sdk.join("ndk").join("26.2.11394342");
        let (home, ndk_home) = (sdk.clone().into_os_string(), stale.clone().into_os_string());

        let toolchain = Toolchain::locate(
            |key| match key {
                ANDROID_HOME => Some(home.clone()),
                NDK_HOME => Some(ndk_home.clone()),
                _ => None,
            },
            "linux",
        );

        fs::remove_dir_all(&sdk).unwrap();
        assert!(matches!(
            toolchain.unwrap().ndk,
            NdkSearch::NdkHomeNotAFolder(path) if path == stale
        ));
    }

    #[test]
    fn finds_no_ndk_in_an_sdk_without_one() {
        let sdk = scratch("sdk-without-ndk");
        let home = sdk.clone().into_os_string();

        let toolchain =
            Toolchain::locate(|key| (key == ANDROID_HOME).then(|| home.clone()), "linux");

        fs::remove_dir_all(&sdk).unwrap();
        assert!(matches!(toolchain.unwrap().ndk, NdkSearch::NoneInstalled));
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
    fn reads_each_attached_device_with_its_state_model_and_connection() {
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
                    transport: Some("493".to_owned()),
                },
                Attached {
                    serial: "emulator-5554".to_owned(),
                    state: AdbState::Ready,
                    model: Some("sdk_gphone64_arm64".to_owned()),
                    transport: Some("494".to_owned()),
                },
                Attached {
                    serial: "R5CT10ABCDE".to_owned(),
                    state: AdbState::Unauthorized,
                    model: None,
                    transport: Some("3".to_owned()),
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

    #[test]
    fn finds_the_phone_name_where_newer_android_capitalises_the_field() {
        let dump = "Bluetooth Status:\n  State:         ON\n  Name:          Pixel 9 Pro\n  Inner app:     com.android.bluetooth\n";

        assert_eq!(bluetooth_name(dump), Some("Pixel 9 Pro"));
    }

    #[test]
    fn builds_for_the_architecture_each_abi_runs() {
        let targets = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64\n"].map(Target::for_abi);

        assert_eq!(
            targets,
            [
                Some(Target::Aarch64),
                Some(Target::Armv7),
                Some(Target::I686),
                Some(Target::X86_64),
            ]
        );
    }

    #[test]
    fn has_no_target_for_an_unknown_abi() {
        assert_eq!(Target::for_abi("mips"), None);
    }
}
