//! Checks that this machine has the tools the repository needs.

use std::ffi::OsStr;

use crate::{android, licences::INSTALL_CARGO_ABOUT, process::Machine};

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
}

/// What the probes need to know about the machine beyond the programs on its path.
pub(crate) struct Host<'a> {
    pub(crate) os: &'a str,
    pub(crate) android: Option<&'a android::Toolchain>,
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
];

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Finding {
    Present { detail: String },
    Missing,
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
    let detail = match requirement.probe {
        Probe::Command { program, args } => machine
            .stdout_of(OsStr::new(program), args)
            .as_deref()
            .and_then(first_line),
        Probe::RustTargets(targets) => machine
            .stdout_of(OsStr::new("rustup"), RUSTUP_INSTALLED_TARGETS)
            .filter(|installed| {
                targets
                    .iter()
                    .all(|target| installed.lines().any(|line| line == *target))
            })
            .map(|_| targets.join(", ")),
        Probe::AndroidSdk => host
            .android
            .map(|android| android.sdk.display().to_string()),
        Probe::AndroidNdk => host
            .android
            .and_then(|android| android.ndk.as_ref())
            .map(|ndk| ndk.display().to_string()),
        Probe::Adb => host
            .android
            .and_then(|android| machine.stdout_of(android.adb().as_os_str(), &["--version"]))
            .as_deref()
            .and_then(first_line),
        Probe::AndroidVirtualDevices => host
            .android
            .and_then(|android| machine.stdout_of(android.emulator().as_os_str(), &["-list-avds"]))
            .map(|listing| android::virtual_device_names(&listing).join(", "))
            .filter(|names| !names.is_empty()),
    };
    detail.map_or(Finding::Missing, |detail| Finding::Present { detail })
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
            .filter(|(requirement, finding)| {
                requirement.need == need && *finding == Finding::Missing
            })
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
        Finding::Missing => ("missing", requirement.fix.to_owned()),
    };
    format!(
        "{status:<STATUS_WIDTH$} {name:<NAME_WIDTH$} {text}",
        name = requirement.name
    )
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    struct FakeMachine {
        installed: &'static [(&'static str, &'static str)],
    }

    impl Machine for FakeMachine {
        fn stdout_of(&self, program: &OsStr, _args: &[&str]) -> Option<String> {
            self.installed
                .iter()
                .find(|(name, _)| *name == program)
                .map(|(_, output)| (*output).to_owned())
        }
    }

    const LINUX: Host<'static> = Host {
        os: "linux",
        android: None,
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

    fn sdk() -> android::Toolchain {
        android::Toolchain {
            sdk: PathBuf::from("/sdk"),
            ndk: Some(PathBuf::from("/sdk/ndk/29.0.13846066")),
        }
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
    fn runs_adb_and_the_emulator_from_the_sdk() {
        let toolchain = sdk();
        let host = Host {
            os: "linux",
            android: Some(&toolchain),
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
}
