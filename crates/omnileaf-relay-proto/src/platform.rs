use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Android,
    Ios,
    Macos,
    Windows,
    Linux,
}

impl Platform {
    pub const ALL: [Self; 5] = [
        Self::Android,
        Self::Ios,
        Self::Macos,
        Self::Windows,
        Self::Linux,
    ];

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Android => "android",
            Self::Ios => "ios",
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
        }
    }

    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|platform| platform.as_str() == text)
    }
}
