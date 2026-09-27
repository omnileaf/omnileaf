//! The local gate, running the same checks as CI's fast lane.

use std::{error::Error, fmt, io};

#[derive(Clone, Copy, Debug, PartialEq, Eq, clap::ValueEnum)]
pub(crate) enum Group {
    Rust,
    Interface,
    Browser,
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
        group: Group::Rust,
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
        name: "dependencies",
        group: Group::Rust,
        program: "cargo",
        args: &["deny", "--locked", "check"],
    },
    Step {
        name: "policy",
        group: Group::Rust,
        program: "cargo",
        args: &["xtask", "policy"],
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
        .filter(|step| only.is_none_or(|group| step.group == group))
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
    fn selects_every_step_without_a_filter() {
        let selected = select(THREE_STEPS, None);

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["first", "second", "third"]);
    }

    #[test]
    fn selects_only_steps_in_the_requested_group() {
        let selected = select(THREE_STEPS, Some(Group::Rust));

        let names: Vec<&str> = selected.iter().map(|step| step.name).collect();
        assert_eq!(names, ["first", "third"]);
    }
}
