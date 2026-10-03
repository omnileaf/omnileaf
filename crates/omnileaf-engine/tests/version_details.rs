use omnileaf_engine::{AppInfo, BuildProfile, Platform, VersionDetails};

fn details() -> VersionDetails {
    VersionDetails {
        app: AppInfo {
            version: "1.2.3".to_owned(),
            platform: Platform::Ios,
            source_code: "repo.example.org/omnileaf".to_owned(),
        },
        build: BuildProfile::Release,
        architecture: "aarch64".to_owned(),
        system: Some("iOS 18.2".to_owned()),
        webview: Some("618.1.15".to_owned()),
        runtime: "Tauri 2.12.0".to_owned(),
    }
}

#[test]
fn lists_the_version_platform_system_webview_and_runtime_one_per_line() {
    let details = details();

    let report = details.to_string();

    assert_eq!(
        report,
        "Omnileaf 1.2.3, release build\n\
         Platform: iOS on aarch64\n\
         System: iOS 18.2\n\
         Webview: 618.1.15\n\
         Runtime: Tauri 2.12.0\n"
    );
}

#[test]
fn names_a_debug_build() {
    let details = VersionDetails {
        build: BuildProfile::Debug,
        ..details()
    };

    let report = details.to_string();

    assert!(
        report.starts_with("Omnileaf 1.2.3, debug build\n"),
        "{report}"
    );
}

#[test]
fn leaves_out_what_the_device_did_not_say() {
    let details = VersionDetails {
        system: None,
        webview: None,
        ..details()
    };

    let report = details.to_string();

    assert_eq!(
        report,
        "Omnileaf 1.2.3, release build\n\
         Platform: iOS on aarch64\n\
         Runtime: Tauri 2.12.0\n"
    );
}

#[test]
fn names_each_platform_as_its_maker_writes_it() {
    let names: Vec<String> = [
        Platform::Android,
        Platform::Ios,
        Platform::Macos,
        Platform::Windows,
        Platform::Linux,
    ]
    .into_iter()
    .map(|platform| {
        VersionDetails {
            app: AppInfo {
                platform,
                ..details().app
            },
            ..details()
        }
        .to_string()
    })
    .map(|report| report.lines().nth(1).unwrap_or_default().to_owned())
    .collect();

    assert_eq!(
        names,
        [
            "Platform: Android on aarch64",
            "Platform: iOS on aarch64",
            "Platform: macOS on aarch64",
            "Platform: Windows on aarch64",
            "Platform: Linux on aarch64",
        ]
    );
}
