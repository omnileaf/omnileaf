use std::ffi::OsStr;

use crate::{android, apple, licences::INSTALL_CARGO_ABOUT, process::Machine};

pub(crate) struct Requirement {
    pub(crate) name: &'static str,
    pub(crate) os: Option<&'static str>,
    pub(crate) need: Need,
    pub(crate) probe: Probe,
    pub(crate) fix: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Need {
    Always,
    ForPhones,
}

pub(crate) enum Probe {
    Command {
        program: &'static str,
        args: &'static [&'static str],
    },
    RustTargets(&'static [&'static str]),
    AndroidSdk,
    AndroidNdk,
    Adb,
    AndroidVirtualDevices,
    IosSimulators,
}

pub(crate) struct Host<'a> {
    pub(crate) os: &'a str,
    pub(crate) android: Option<&'a android::Toolchain>,
    pub(crate) pinned_ndk: &'a str,
}

pub(crate) const REQUIREMENTS: &[Requirement] = &[
    Requirement {
        name: "rustup",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "rustup",
            args: &["--version"],
        },
        fix: "install rustup from https://rustup.rs",
    },
    Requirement {
        name: "cargo-nextest",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "cargo",
            args: &["nextest", "--version"],
        },
        fix: "cargo install --locked cargo-nextest",
    },
    Requirement {
        name: "cargo-deny",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "cargo",
            args: &["deny", "--version"],
        },
        fix: "cargo install --locked cargo-deny",
    },
    Requirement {
        name: "cargo-about",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "cargo",
            args: &["about", "--version"],
        },
        fix: INSTALL_CARGO_ABOUT,
    },
    Requirement {
        name: "node",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "node",
            args: &["--version"],
        },
        fix: "install the Node version in .node-version, for example with mise",
    },
    Requirement {
        name: "pnpm",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "pnpm",
            args: &["--version"],
        },
        fix: "install the pnpm version in package.json's packageManager field",
    },
    Requirement {
        name: "webkit2gtk-4.1",
        os: Some("linux"),
        need: Need::Always,
        probe: Probe::Command {
            program: "pkg-config",
            args: &["--modversion", "webkit2gtk-4.1"],
        },
        fix: "install the WebKitGTK 4.1 development package, for example libwebkit2gtk-4.1-dev or webkit2gtk-4.1",
    },
    Requirement {
        name: "xcode-tools",
        os: Some("macos"),
        need: Need::Always,
        probe: Probe::Command {
            program: "xcode-select",
            args: &["--print-path"],
        },
        fix: "install the Xcode command line tools with xcode-select --install",
    },
    Requirement {
        name: "android-sdk",
        os: None,
        need: Need::ForPhones,
        probe: Probe::AndroidSdk,
        fix: "install Android Studio, or set ANDROID_HOME to the Android SDK",
    },
    Requirement {
        name: "android-ndk",
        os: None,
        need: Need::ForPhones,
        probe: Probe::AndroidNdk,
        fix: "install the NDK from Android Studio's SDK Manager, or set NDK_HOME",
    },
    Requirement {
        name: "adb",
        os: None,
        need: Need::ForPhones,
        probe: Probe::Adb,
        fix: "install the Android SDK Platform-Tools from Android Studio's SDK Manager",
    },
    Requirement {
        name: "android-avds",
        os: None,
        need: Need::ForPhones,
        probe: Probe::AndroidVirtualDevices,
        fix: "create a virtual device in Android Studio's Device Manager, or connect a phone",
    },
    Requirement {
        name: "android-rust",
        os: None,
        need: Need::ForPhones,
        probe: Probe::RustTargets(&["aarch64-linux-android"]),
        fix: "rustup target add aarch64-linux-android",
    },
    Requirement {
        name: "xcode",
        os: Some("macos"),
        need: Need::ForPhones,
        probe: Probe::Command {
            program: "xcodebuild",
            args: &["-version"],
        },
        fix: "install Xcode, then select it with sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
    },
    Requirement {
        name: "ios-simulators",
        os: Some("macos"),
        need: Need::ForPhones,
        probe: Probe::IosSimulators,
        fix: "install an iOS Simulator runtime in Xcode's Components settings",
    },
    Requirement {
        name: "ios-rust",
        os: Some("macos"),
        need: Need::ForPhones,
        probe: Probe::RustTargets(&["aarch64-apple-ios", "aarch64-apple-ios-sim"]),
        fix: "rustup target add aarch64-apple-ios aarch64-apple-ios-sim",
    },
    Requirement {
        name: "appium",
        os: None,
        need: Need::ForPhones,
        probe: Probe::Command {
            program: "appium",
            args: &["--version"],
        },
        fix: "npm install --global appium@3.8.0, for the Android and iOS app tests",
    },
];

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Finding {
    Present { detail: String },
    Differs { detail: String },
    Broken { detail: String },
    Missing,
}

impl Finding {
    fn is_missing(&self) -> bool {
        match self {
            Self::Present { .. } | Self::Differs { .. } => false,
            Self::Broken { .. } | Self::Missing => true,
        }
    }
}

pub(crate) struct Report {
    pub(crate) lines: Vec<String>,
    pub(crate) missing: usize,
    pub(crate) missing_for_phones: usize,
}

const RUSTUP_INSTALLED_TARGETS: &[&str] = &["target", "list", "--installed"];

pub(crate) fn examine(
    requirement: &Requirement,
    machine: &impl Machine,
    host: &Host<'_>,
) -> Finding {
    match requirement.probe {
        Probe::Command { program, args } => found(
            machine
                .stdout_of(OsStr::new(program), args)
                .as_deref()
                .and_then(first_line),
        ),
        Probe::RustTargets(targets) => found(
            machine
                .stdout_of(OsStr::new("rustup"), RUSTUP_INSTALLED_TARGETS)
                .filter(|installed| {
                    targets
                        .iter()
                        .all(|target| installed.lines().any(|line| line == *target))
                })
                .map(|_| targets.join(", ")),
        ),
        Probe::AndroidSdk => found(
            host.android
                .map(|android| android.sdk.display().to_string()),
        ),
        Probe::AndroidNdk => host
            .android
            .map_or(Finding::Missing, |android| match &android.ndk {
                android::NdkSearch::Found(ndk) => compare_ndk(ndk, host.pinned_ndk),
                android::NdkSearch::NdkHomeNotAFolder(path) => Finding::Broken {
                    detail: format!(
                        "NDK_HOME points at {}, which isn't a folder: point it at an installed NDK or unset it",
                        path.display()
                    ),
                },
                android::NdkSearch::NoneInstalled => Finding::Missing,
            }),
        Probe::Adb => found(
            host.android
                .and_then(|android| machine.stdout_of(android.adb().as_os_str(), &["--version"]))
                .as_deref()
                .and_then(first_line),
        ),
        Probe::AndroidVirtualDevices => found(
            host.android
                .and_then(|android| {
                    machine.stdout_of(android.emulator().as_os_str(), &["-list-avds"])
                })
                .map(|listing| android::virtual_device_names(&listing).join(", "))
                .filter(|names| !names.is_empty()),
        ),
        Probe::IosSimulators => found(
            machine
                .stdout_of(OsStr::new("xcrun"), apple::LIST_SIMULATORS)
                .and_then(|listing| apple::ios_simulators(&listing).ok())
                .map(|simulators| simulators.len())
                .filter(|count| *count > 0)
                .map(|count| format!("{count} iOS Simulators")),
        ),
    }
}

fn found(detail: Option<String>) -> Finding {
    detail.map_or(Finding::Missing, |detail| Finding::Present { detail })
}

fn compare_ndk(ndk: &android::Ndk, pinned: &str) -> Finding {
    let path = ndk.path.display();
    match ndk.revision.as_deref() {
        Some(revision) if revision == pinned => Finding::Present {
            detail: path.to_string(),
        },
        Some(revision) => Finding::Differs {
            detail: format!("{path} is NDK {revision}, CI builds with {pinned}"),
        },
        None => Finding::Broken {
            detail: format!(
                "{path} has no version in source.properties, so it isn't a usable NDK: point NDK_HOME at an installed NDK or install one from Android Studio's SDK Manager"
            ),
        },
    }
}

fn first_line(output: &str) -> Option<String> {
    output.lines().next().map(|line| line.trim().to_owned())
}

const STATUS_WIDTH: usize = 8;
const NAME_WIDTH: usize = 16;

fn applies_to(requirement: &Requirement, os: &str) -> bool {
    requirement.os.is_none_or(|required| required == os)
}

pub(crate) fn render(
    requirements: &[Requirement],
    machine: &impl Machine,
    host: &Host<'_>,
) -> Report {
    let findings: Vec<(&Requirement, Finding)> = requirements
        .iter()
        .filter(|requirement| applies_to(requirement, host.os))
        .map(|requirement| (requirement, examine(requirement, machine, host)))
        .collect();
    let missing_with = |need: Need| {
        findings
            .iter()
            .filter(|(requirement, finding)| requirement.need == need && finding.is_missing())
            .count()
    };
    let missing = missing_with(Need::Always);
    let missing_for_phones = missing_with(Need::ForPhones);
    let lines = findings
        .into_iter()
        .map(|(requirement, finding)| line(requirement, finding))
        .collect();
    Report {
        lines,
        missing,
        missing_for_phones,
    }
}

fn line(requirement: &Requirement, finding: Finding) -> String {
    let (status, text) = match finding {
        Finding::Present { detail } => ("ok", detail),
        Finding::Differs { detail } => ("differs", format!("{detail}: {}", requirement.fix)),
        Finding::Broken { detail } => ("broken", detail),
        Finding::Missing => ("missing", requirement.fix.to_owned()),
    };
    format!(
        "{status:<STATUS_WIDTH$} {name:<NAME_WIDTH$} {text}",
        name = requirement.name
    )
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::*;

    struct FakeMachine {
        installed: &'static [(&'static str, &'static str)],
    }

    impl Machine for FakeMachine {
        fn stdout_of(&self, program: &OsStr, _args: &[&str]) -> Option<String> {
            self.installed
                .iter()
                .find(|(name, _)| Path::new(name) == Path::new(program))
                .map(|(_, output)| (*output).to_owned())
        }
    }

    const LINUX: Host<'static> = Host {
        os: "linux",
        android: None,
        pinned_ndk: PINNED,
    };

    fn requirement(need: Need, probe: Probe) -> Requirement {
        Requirement {
            name: "probed",
            os: None,
            need,
            probe,
            fix: "install it",
        }
    }

    const PINNED: &str = "29.0.13846066";

    fn sdk() -> android::Toolchain {
        sdk_with_ndk_revision(Some(PINNED))
    }

    fn sdk_with_ndk_revision(revision: Option<&str>) -> android::Toolchain {
        android::Toolchain {
            sdk: PathBuf::from("/sdk"),
            ndk: android::NdkSearch::Found(android::Ndk {
                path: PathBuf::from("/sdk/ndk/29.0.13846066"),
                revision: revision.map(str::to_owned),
            }),
        }
    }

    fn examine_ndk(toolchain: &android::Toolchain) -> Finding {
        let host = Host {
            os: "linux",
            android: Some(toolchain),
            pinned_ndk: PINNED,
        };

        examine(
            &requirement(Need::ForPhones, Probe::AndroidNdk),
            &FakeMachine { installed: &[] },
            &host,
        )
    }

    const TOOL: Requirement = Requirement {
        name: "tool",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "tool",
            args: &["--version"],
        },
        fix: "install tool",
    };

    const OTHER: Requirement = Requirement {
        name: "other",
        os: None,
        need: Need::Always,
        probe: Probe::Command {
            program: "other",
            args: &["--version"],
        },
        fix: "install other",
    };

    #[test]
    fn finds_an_installed_tool_with_its_version_line() {
        let machine = FakeMachine {
            installed: &[("tool", "tool 1.2.3")],
        };

        let finding = examine(&TOOL, &machine, &LINUX);

        assert_eq!(
            finding,
            Finding::Present {
                detail: "tool 1.2.3".to_owned()
            }
        );
    }

    #[test]
    fn reports_a_tool_that_is_not_installed_as_missing() {
        let machine = FakeMachine { installed: &[] };

        let finding = examine(&TOOL, &machine, &LINUX);

        assert_eq!(finding, Finding::Missing);
    }

    #[test]
    fn report_counts_missing_tools_and_shows_how_to_fix_them() {
        let machine = FakeMachine {
            installed: &[("tool", "tool 1.2.3")],
        };

        let report = render(&[TOOL, OTHER], &machine, &LINUX);

        assert_eq!(report.missing, 1);
        assert!(report.lines[0].contains("tool 1.2.3"));
        assert!(report.lines[1].contains("install other"));
    }

    #[test]
    fn skips_requirements_for_other_operating_systems() {
        let machine = FakeMachine {
            installed: &[("tool", "tool 1.2.3")],
        };
        let linux_only = Requirement {
            name: "other",
            os: Some("linux"),
            ..OTHER
        };

        let mac = Host {
            os: "macos",
            android: None,
            pinned_ndk: PINNED,
        };

        let report = render(&[TOOL, linux_only], &machine, &mac);

        assert_eq!(report.missing, 0);
        assert_eq!(report.lines.len(), 1);
    }

    #[test]
    fn finds_rust_targets_only_when_every_one_is_installed() {
        let machine = FakeMachine {
            installed: &[("rustup", "aarch64-apple-darwin\naarch64-linux-android\n")],
        };
        let one = requirement(
            Need::ForPhones,
            Probe::RustTargets(&["aarch64-linux-android"]),
        );
        let two = requirement(
            Need::ForPhones,
            Probe::RustTargets(&["aarch64-linux-android", "x86_64-linux-android"]),
        );

        let findings = [&one, &two].map(|requirement| examine(requirement, &machine, &LINUX));

        assert_eq!(
            findings,
            [
                Finding::Present {
                    detail: "aarch64-linux-android".to_owned()
                },
                Finding::Missing
            ]
        );
    }

    #[test]
    fn reports_the_android_tools_missing_without_an_sdk() {
        let machine = FakeMachine {
            installed: &[(
                "/sdk/platform-tools/adb",
                "Android Debug Bridge version 1.0.41",
            )],
        };

        let findings = [
            Probe::AndroidSdk,
            Probe::AndroidNdk,
            Probe::Adb,
            Probe::AndroidVirtualDevices,
        ]
        .map(|probe| examine(&requirement(Need::ForPhones, probe), &machine, &LINUX));

        assert_eq!(findings, [const { Finding::Missing }; 4]);
    }

    #[test]
    fn shows_where_the_sdk_and_ndk_are() {
        let toolchain = sdk();
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
            pinned_ndk: PINNED,
        };
        let machine = FakeMachine { installed: &[] };

        let findings = [Probe::AndroidSdk, Probe::AndroidNdk]
            .map(|probe| examine(&requirement(Need::ForPhones, probe), &machine, &host));

        assert_eq!(
            findings,
            [
                Finding::Present {
                    detail: "/sdk".to_owned()
                },
                Finding::Present {
                    detail: "/sdk/ndk/29.0.13846066".to_owned()
                }
            ]
        );
    }

    #[test]
    fn reports_an_ndk_that_differs_from_the_pinned_version() {
        let toolchain = sdk_with_ndk_revision(Some("27.1.12297006"));

        let finding = examine_ndk(&toolchain);

        assert_eq!(
            finding,
            Finding::Differs {
                detail: "/sdk/ndk/29.0.13846066 is NDK 27.1.12297006, CI builds with 29.0.13846066"
                    .to_owned()
            }
        );
    }

    #[test]
    fn reports_an_ndk_with_no_readable_version_as_broken() {
        let toolchain = sdk_with_ndk_revision(None);

        let finding = examine_ndk(&toolchain);

        assert_eq!(
            finding,
            Finding::Broken {
                detail: "/sdk/ndk/29.0.13846066 has no version in source.properties, so it isn't a usable NDK: point NDK_HOME at an installed NDK or install one from Android Studio's SDK Manager"
                    .to_owned()
            }
        );
    }

    #[test]
    fn warns_about_a_differing_ndk_without_counting_it_missing() {
        let toolchain = sdk_with_ndk_revision(Some("27.1.12297006"));
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
            pinned_ndk: PINNED,
        };
        let ndk = requirement(Need::ForPhones, Probe::AndroidNdk);

        let report = render(&[ndk], &FakeMachine { installed: &[] }, &host);

        assert_eq!((report.missing, report.missing_for_phones), (0, 0));
        assert!(report.lines[0].starts_with("differs"));
        assert!(report.lines[0].ends_with("CI builds with 29.0.13846066: install it"));
    }

    fn sdk_with_stale_ndk_home() -> android::Toolchain {
        android::Toolchain {
            sdk: PathBuf::from("/sdk"),
            ndk: android::NdkSearch::NdkHomeNotAFolder(PathBuf::from("/sdk/ndk/26.2.11394342")),
        }
    }

    #[test]
    fn reports_an_ndk_home_that_is_not_a_folder_as_broken() {
        let toolchain = sdk_with_stale_ndk_home();

        let finding = examine_ndk(&toolchain);

        assert_eq!(
            finding,
            Finding::Broken {
                detail: "NDK_HOME points at /sdk/ndk/26.2.11394342, which isn't a folder: point it at an installed NDK or unset it"
                    .to_owned()
            }
        );
    }

    #[test]
    fn counts_a_broken_ndk_home_as_a_missing_phone_tool() {
        let toolchain = sdk_with_stale_ndk_home();
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
            pinned_ndk: PINNED,
        };
        let ndk = requirement(Need::ForPhones, Probe::AndroidNdk);

        let report = render(&[ndk], &FakeMachine { installed: &[] }, &host);

        assert_eq!((report.missing, report.missing_for_phones), (0, 1));
        assert!(report.lines[0].starts_with("broken"));
    }

    #[test]
    fn runs_adb_and_the_emulator_from_the_sdk() {
        let toolchain = sdk();
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
            pinned_ndk: PINNED,
        };
        let machine = FakeMachine {
            installed: &[
                (
                    "/sdk/platform-tools/adb",
                    "Android Debug Bridge version 1.0.41\nVersion 36.0.0",
                ),
                ("/sdk/emulator/emulator", "Pixel_10_Pro\nPixel_10_Pro_XL\n"),
            ],
        };

        let findings = [Probe::Adb, Probe::AndroidVirtualDevices]
            .map(|probe| examine(&requirement(Need::ForPhones, probe), &machine, &host));

        assert_eq!(
            findings,
            [
                Finding::Present {
                    detail: "Android Debug Bridge version 1.0.41".to_owned()
                },
                Finding::Present {
                    detail: "Pixel_10_Pro, Pixel_10_Pro_XL".to_owned()
                }
            ]
        );
    }

    #[test]
    fn reports_no_virtual_devices_when_the_emulator_lists_none() {
        let toolchain = sdk();
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
            pinned_ndk: PINNED,
        };
        let machine = FakeMachine {
            installed: &[("/sdk/emulator/emulator", "")],
        };

        let finding = examine(
            &requirement(Need::ForPhones, Probe::AndroidVirtualDevices),
            &machine,
            &host,
        );

        assert_eq!(finding, Finding::Missing);
    }

    #[test]
    fn counts_missing_phone_tools_apart_from_the_ones_every_build_needs() {
        let machine = FakeMachine { installed: &[] };
        let phones = requirement(Need::ForPhones, Probe::AndroidSdk);

        let report = render(&[OTHER, phones], &machine, &LINUX);

        assert_eq!((report.missing, report.missing_for_phones), (1, 1));
    }

    #[test]
    fn counts_the_ios_simulators_xcode_lists() {
        let machine = FakeMachine {
            installed: &[(
                "xcrun",
                r#"{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-27-0":[
                    {"udid":"75BD17D7-0A6C-48A1-9768-568ACF690500","state":"Shutdown","name":"iPhone 18 Pro"},
                    {"udid":"2AD917AF-392E-4478-8CF1-D866F1DDDCE6","state":"Booted","name":"iPhone 18 Pro Max"}
                ]}}"#,
            )],
        };

        let finding = examine(
            &requirement(Need::ForPhones, Probe::IosSimulators),
            &machine,
            &LINUX,
        );

        assert_eq!(
            finding,
            Finding::Present {
                detail: "2 iOS Simulators".to_owned()
            }
        );
    }

    #[test]
    fn reports_no_ios_simulators_without_a_runtime() {
        let machine = FakeMachine {
            installed: &[("xcrun", r#"{"devices":{}}"#)],
        };

        let finding = examine(
            &requirement(Need::ForPhones, Probe::IosSimulators),
            &machine,
            &LINUX,
        );

        assert_eq!(finding, Finding::Missing);
    }
}
