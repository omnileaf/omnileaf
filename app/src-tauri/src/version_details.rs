//! The version details of the running app, gathered from the device.

use omnileaf_engine::{AppInfo, BuildProfile, VersionDetails};
use os_info::{Type, Version};

pub(crate) fn current(app: AppInfo) -> VersionDetails {
    VersionDetails {
        app,
        build: BuildProfile::CURRENT,
        architecture: std::env::consts::ARCH.to_owned(),
        system: system(),
        webview: tauri::webview_version()
            .inspect_err(|error| tracing::debug!(%error, "read the webview's version"))
            .ok(),
        runtime: format!("Tauri {}", tauri::VERSION),
    }
}

pub(crate) fn system() -> Option<String> {
    let system = os_info::get();
    system_name(system.os_type(), system.version())
}

fn system_name(os_type: Type, version: &Version) -> Option<String> {
    match (os_type, version) {
        (Type::Unknown, _) => None,
        (_, Version::Unknown) => Some(os_type.to_string()),
        _ => Some(format!("{os_type} {version}")),
    }
}

#[cfg(test)]
mod tests {
    use os_info::{Type, Version};

    use super::system_name;

    #[test]
    fn names_the_system_and_its_version() {
        let name = system_name(Type::Macos, &Version::Semantic(14, 5, 0));

        assert_eq!(name.as_deref(), Some("Mac OS 14.5.0"));
    }

    #[test]
    fn names_the_system_alone_when_its_version_is_unknown() {
        let name = system_name(Type::Android, &Version::Unknown);

        assert_eq!(name.as_deref(), Some("Android"));
    }

    #[test]
    fn says_nothing_about_an_unknown_system() {
        let name = system_name(Type::Unknown, &Version::Custom("1".to_owned()));

        assert_eq!(name, None);
    }
}
