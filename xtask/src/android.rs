//! Finds the Android SDK and NDK where Tauri looks for them.

use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

const ANDROID_HOME: &str = "ANDROID_HOME";
const ANDROID_SDK_ROOT: &str = "ANDROID_SDK_ROOT";
const NDK_HOME: &str = "NDK_HOME";

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
}
