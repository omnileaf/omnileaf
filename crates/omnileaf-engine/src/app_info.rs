use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: Platform,
    pub source_code: String,
}

impl AppInfo {
    pub const NAME: &str = "Omnileaf";
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
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

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Android => "Android",
            Self::Ios => "iOS",
            Self::Macos => "macOS",
            Self::Windows => "Windows",
            Self::Linux => "Linux",
        }
    }
}
