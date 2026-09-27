//! The local gate, running the same checks as CI's fast lane.

use std::{error::Error, fmt, io};

pub(crate) struct Step {
    pub(crate) name: &'static str,
    pub(crate) program: &'static str,
    pub(crate) args: &'static [&'static str],
}

pub(crate) const STEPS: &[Step] = &[
    Step {
        name: "format",
        program: "cargo",
        args: &["fmt", "--all", "--check"],
    },
    Step {
        name: "lint",
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
        program: "cargo",
        args: &["deny", "--locked", "check"],
    },
    Step {
        name: "policy",
        program: "cargo",
        args: &["xtask", "policy"],
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

pub(crate) fn run_all(steps: &[Step], runner: &impl Runner) -> Result<(), CheckError> {
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
            program: "true",
            args: &[],
        },
        Step {
            name: "second",
            program: "true",
            args: &[],
        },
        Step {
            name: "third",
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
}
