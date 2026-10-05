use std::fmt;

use crate::{AppInfo, Platform};

const APP_NAME: &str = "Omnileaf";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BuildProfile {
    Debug,
    Release,
}

impl BuildProfile {
    pub const CURRENT: Self = if cfg!(debug_assertions) {
        Self::Debug
    } else {
        Self::Release
    };

    fn name(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Release => "release",
        }
    }
}

/// What a bug report needs to know about the running app, written as plain text by `Display`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VersionDetails {
    pub app: AppInfo,
    pub build: BuildProfile,
    pub architecture: String,
    pub system: Option<String>,
    pub webview: Option<String>,
    pub runtime: String,
}

impl fmt::Display for VersionDetails {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            f,
            "{APP_NAME} {}, {} build",
            self.app.version,
            self.build.name()
        )?;
        writeln!(
            f,
            "Platform: {} on {}",
            platform_name(self.app.platform),
            self.architecture
        )?;
        if let Some(system) = &self.system {
            writeln!(f, "System: {system}")?;
        }
        if let Some(webview) = &self.webview {
            writeln!(f, "Webview: {webview}")?;
        }
        writeln!(f, "Runtime: {}", self.runtime)
    }
}

fn platform_name(platform: Platform) -> &'static str {
    match platform {
        Platform::Android => "Android",
        Platform::Ios => "iOS",
        Platform::Macos => "macOS",
        Platform::Windows => "Windows",
        Platform::Linux => "Linux",
    }
}
