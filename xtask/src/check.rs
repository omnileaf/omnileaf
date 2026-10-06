//! The local gate, running the same checks as CI's fast lane.

use std::{error::Error, fmt, io};

#[derive(Clone, Copy, Debug, PartialEq, Eq, clap::ValueEnum)]
pub(crate) enum Group {
    Rust,
    /// Checks whose outcome is the same on every platform, so CI runs them once.
    Portable,
    Interface,
    Browser,
    App,
    Android,
    Ios,
}

impl Group {
    /// The mobile tests need a running emulator or Simulator and Appium, so they run only when asked for.
    fn runs_by_default(self) -> bool {
        !matches!(self, Self::Android | Self::Ios)
    }
}

pub(crate) struct Step {
    pub(crate) name: &'static str,
    pub(crate) group: Group,
    pub(crate) program: &'static str,
    pub(crate) args: &'static [&'static str],
}

pub(crate) const STEPS: &[Step] = &[
    Step {
        name: "format",
        group: Group::Portable,
        program: "cargo",
        args: &["fmt", "--all", "--check"],
    },
    Step {
        name: "lint",
        group: Group::Rust,
        program: "cargo",
        args: &[
            "clippy",
            "--workspace",
            "--all-targets",
            "--all-features",
            "--locked",
            "--",
            "-D",
            "warnings",
        ],
    },
    Step {
        name: "fuzz format",
        group: Group::Portable,
        program: "cargo",
        args: &["fmt", "--manifest-path", "fuzz/Cargo.toml", "--check"],
    },
    Step {
        name: "fuzz lint",
        group: Group::Portable,
        program: "cargo",
        args: &[
            "clippy",
            "--manifest-path",
            "fuzz/Cargo.toml",
            "--all-targets",
            "--locked",
            "--",
            "-D",
            "warnings",
        ],
    },
    Step {
        name: "test",
        group: Group::Rust,
        program: "cargo",
        args: &[
            "nextest",
            "run",
            "--workspace",
            "--all-features",
            "--locked",
        ],
    },
    Step {
        name: "listing speed",
        group: Group::Rust,
        program: "cargo",
        args: &[
            "nextest",
            "run",
            "--package",
            "omnileaf-formats",
            "--test",
            "listing_speed",
            "--release",
            "--run-ignored",
            "only",
            "--no-capture",
            "--locked",
        ],
    },
    Step {
        name: "title page speed",
        group: Group::Rust,
        program: "cargo",
        args: &[
            "nextest",
            "run",
            "--package",
            "omnileaf-db",
            "--test",
            "title_page_speed",
            "--release",
            "--run-ignored",
            "only",
            "--no-capture",
            "--locked",
        ],
    },
    Step {
        name: "scan speed",
        group: Group::Rust,
        program: "cargo",
        args: &[
            "nextest",
            "run",
            "--package",
            "omnileaf-engine",
            "--test",
            "scan_speed",
            "--release",
            "--run-ignored",
            "only",
            "--no-capture",
            "--locked",
        ],
    },
    Step {
        name: "webassembly",
        group: Group::Portable,
        program: "cargo",
        args: &[
            "build",
            "--package",
            "omnileaf-sync-proto",
            "--target",
            "wasm32-unknown-unknown",
            "--locked",
        ],
    },
    Step {
        name: "dependencies",
        group: Group::Portable,
        program: "cargo",
        args: &["deny", "--locked", "check"],
    },
    Step {
        name: "policy",
        group: Group::Portable,
        program: "cargo",
        args: &["xtask", "policy"],
    },
    Step {
        name: "licences",
        group: Group::Portable,
        program: "cargo",
        args: &["xtask", "licences", "--check"],
    },
    Step {
        name: "sync rules",
        group: Group::Portable,
        program: "cargo",
        args: &["xtask", "lint-sync"],
    },
    Step {
        name: "interface types",
        group: Group::Interface,
        program: "pnpm",
        args: &["--recursive", "run", "check"],
    },
    Step {
        name: "interface lint",
        group: Group::Interface,
        program: "pnpm",
        args: &["--recursive", "run", "lint"],
    },
    Step {
        name: "interface tests",
        group: Group::Interface,
        program: "pnpm",
        args: &["--recursive", "run", "test"],
    },
    Step {
        name: "interface build",
        group: Group::Interface,
        program: "pnpm",
        args: &["--recursive", "run", "build"],
    },
    Step {
        name: "browser tests",
        group: Group::Browser,
        program: "pnpm",
        args: &["--recursive", "run", "test:e2e"],
    },
    Step {
        name: "app tests",
        group: Group::App,
        program: "pnpm",
        args: &["--recursive", "run", "test:app"],
    },
    Step {
        name: "android tests",
        group: Group::Android,
        program: "pnpm",
        args: &["--recursive", "run", "test:android"],
    },
    Step {
        name: "ios tests",
        group: Group::Ios,
        program: "pnpm",
        args: &["--recursive", "run", "test:ios"],
    },
];

pub(crate) trait Runner {
    fn run(&self, step: &Step) -> io::Result<bool>;
}

#[derive(Debug)]
pub(crate) enum CheckError {
    Failed {
        step: &'static str,
    },
    Spawn {
        step: &'static str,
        source: io::Error,
    },
}

impl fmt::Display for CheckError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Failed { step } => write!(f, "check `{step}` failed"),
            Self::Spawn { step, .. } => write!(f, "could not start check `{step}`"),
        }
    }
}

impl Error for CheckError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Failed { .. } => None,
            Self::Spawn { source, .. } => Some(source),
        }
    }
}

pub(crate) fn select(steps: &[Step], only: Option<Group>) -> Vec<&Step> {
    steps
        .iter()
        .filter(|step| {
            only.map_or_else(|| step.group.runs_by_default(), |group| step.group == group)
        })
        .collect()
}

pub(crate) fn run_all<'a>(
    steps: impl IntoIterator<Item = &'a Step>,
    runner: &impl Runner,
) -> Result<(), CheckError> {
    for step in steps {
        let passed = runner.run(step).map_err(|source| CheckError::Spawn {
            step: step.name,
            source,
        })?;
        if !passed {
            return Err(CheckError::Failed { step: step.name });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct FakeRunner {
        failing: Option<&'static str>,
        unstartable: Option<&'static str>,
        ran: RefCell<Vec<&'static str>>,
    }

    impl FakeRunner {
        fn passing() -> Self {
            Self {
                failing: None,
                unstartable: None,
                ran: RefCell::new(Vec::new()),
            }
        }
    }

    impl Runner for FakeRunner {
        fn run(&self, step: &Step) -> io::Result<bool> {
            self.ran.borrow_mut().push(step.name);
            if self.unstartable == Some(step.name) {
                return Err(io::Error::from(io::ErrorKind::NotFound));
            }
            Ok(self.failing != Some(step.name))
        }
    }

    const THREE_STEPS: &[Step] = &[
        Step {
            name: "first",
            group: Group::Rust,
            program: "true",
            args: &[],
        },
        Step {
            name: "second",
            group: Group::Interface,
            program: "true",
            args: &[],
        },
        Step {
            name: "third",
            group: Group::Rust,
            program: "true",
            args: &[],
        },
    ];

    #[test]
    fn runs_every_step_in_order_when_all_pass() {
        let runner = FakeRunner::passing();

        let result = run_all(THREE_STEPS, &runner);

        assert!(result.is_ok());
        assert_eq!(*runner.ran.borrow(), ["first", "second", "third"]);
    }

    #[test]
    fn stops_at_the_first_failing_step() {
        let runner = FakeRunner {
            failing: Some("second"),
            ..FakeRunner::passing()
        };

        let result = run_all(THREE_STEPS, &runner);

        assert!(matches!(result, Err(CheckError::Failed { step: "second" })));
        assert_eq!(*runner.ran.borrow(), ["first", "second"]);
    }

    #[test]
    fn reports_a_step_that_cannot_start() {
        let runner = FakeRunner {
            unstartable: Some("first"),
            ..FakeRunner::passing()
        };

        let result = run_all(THREE_STEPS, &runner);

        assert!(matches!(
            result,
            Err(CheckError::Spawn { step: "first", .. })
        ));
        assert_eq!(*runner.ran.borrow(), ["first"]);
    }

    #[test]
    fn selects_every_default_step_without_a_filter() {
        let selected = select(THREE_STEPS, None);

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["first", "second", "third"]);
    }

    const RUST_PORTABLE_AND_MOBILE: &[Step] = &[
        Step {
            name: "rust",
            group: Group::Rust,
            program: "true",
            args: &[],
        },
        Step {
            name: "portable",
            group: Group::Portable,
            program: "true",
            args: &[],
        },
        Step {
            name: "android",
            group: Group::Android,
            program: "true",
            args: &[],
        },
        Step {
            name: "ios",
            group: Group::Ios,
            program: "true",
            args: &[],
        },
    ];

    #[test]
    fn leaves_only_the_mobile_steps_out_without_a_filter() {
        let selected = select(RUST_PORTABLE_AND_MOBILE, None);

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["rust", "portable"]);
    }

    #[test]
    fn selects_the_android_steps_when_asked() {
        let selected = select(RUST_PORTABLE_AND_MOBILE, Some(Group::Android));

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["android"]);
    }

    fn names_in(group: Group) -> Vec<&'static str> {
        select(STEPS, Some(group))
            .iter()
            .map(|step| step.name)
            .collect()
    }

    #[test]
    fn the_rust_group_keeps_only_the_checks_that_depend_on_the_platform() {
        assert_eq!(
            names_in(Group::Rust),
            [
                "lint",
                "test",
                "listing speed",
                "title page speed",
                "scan speed",
            ]
        );
    }

    #[test]
    fn the_portable_group_holds_the_checks_that_answer_the_same_everywhere() {
        assert_eq!(
            names_in(Group::Portable),
            [
                "format",
                "fuzz format",
                "fuzz lint",
                "webassembly",
                "dependencies",
                "policy",
                "licences",
                "sync rules",
            ]
        );
    }

    fn portable_group_runs_on_the_fuzz_crate(subcommand: &str) -> bool {
        select(STEPS, Some(Group::Portable)).iter().any(|step| {
            step.args.first() == Some(&subcommand)
                && step
                    .args
                    .windows(2)
                    .any(|pair| pair == ["--manifest-path", "fuzz/Cargo.toml"])
        })
    }

    #[test]
    fn the_portable_group_checks_the_fuzz_crate_formatting() {
        assert!(portable_group_runs_on_the_fuzz_crate("fmt"));
    }

    #[test]
    fn the_portable_group_lints_the_fuzz_crate() {
        assert!(portable_group_runs_on_the_fuzz_crate("clippy"));
    }

    #[test]
    fn selects_only_steps_in_the_requested_group() {
        let selected = select(THREE_STEPS, Some(Group::Rust));

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["first", "third"]);
    }
}
