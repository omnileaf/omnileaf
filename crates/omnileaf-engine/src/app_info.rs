use serde::Serialize;
use specta::Type;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: Platform,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Android,
    Ios,
    Macos,
    Windows,
    Linux,
}

impl Platform {
    /// The platform this build targets; other Unix systems count as Linux, the nearest look.
    pub const CURRENT: Self = if cfg!(target_os = "android") {
        Self::Android
    } else if cfg!(target_os = "ios") {
        Self::Ios
    } else if cfg!(target_os = "macos") {
        Self::Macos
    } else if cfg!(windows) {
        Self::Windows
    } else {
        Self::Linux
    };
}
