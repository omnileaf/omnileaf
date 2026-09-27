//! Checks that this machine has the tools the repository needs.

pub(crate) struct Requirement {
    pub(crate) name: &'static str,
    pub(crate) probe: Probe,
    pub(crate) fix: &'static str,
}

pub(crate) enum Probe {
    Command {
        program: &'static str,
        args: &'static [&'static str],
    },
}

pub(crate) const REQUIREMENTS: &[Requirement] = &[
    Requirement {
        name: "rustup",
        probe: Probe::Command {
            program: "rustup",
            args: &["--version"],
        },
        fix: "install rustup from https://rustup.rs",
    },
    Requirement {
        name: "cargo-nextest",
        probe: Probe::Command {
            program: "cargo",
            args: &["nextest", "--version"],
        },
        fix: "cargo install --locked cargo-nextest",
    },
];

pub(crate) trait Machine {
    fn first_line_of(&self, program: &str, args: &[&str]) -> Option<String>;
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Finding {
    Present { detail: String },
    Missing,
}

pub(crate) struct Report {
    pub(crate) lines: Vec<String>,
    pub(crate) missing: usize,
}

pub(crate) fn examine(requirement: &Requirement, machine: &impl Machine) -> Finding {
    let Probe::Command { program, args } = requirement.probe;
    machine
        .first_line_of(program, args)
        .map_or(Finding::Missing, |detail| Finding::Present { detail })
}

const STATUS_WIDTH: usize = 8;
const NAME_WIDTH: usize = 16;

pub(crate) fn render(requirements: &[Requirement], machine: &impl Machine) -> Report {
    let findings: Vec<(&Requirement, Finding)> = requirements
        .iter()
        .map(|requirement| (requirement, examine(requirement, machine)))
        .collect();
    let missing = findings
        .iter()
        .filter(|(_, finding)| *finding == Finding::Missing)
        .count();
    let lines = findings
        .into_iter()
        .map(|(requirement, finding)| line(requirement, finding))
        .collect();
    Report { lines, missing }
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
    use super::*;

    struct FakeMachine {
        installed: &'static [(&'static str, &'static str)],
    }

    impl Machine for FakeMachine {
        fn first_line_of(&self, program: &str, _args: &[&str]) -> Option<String> {
            self.installed
                .iter()
                .find(|(name, _)| *name == program)
                .map(|(_, line)| (*line).to_owned())
        }
    }

    const TOOL: Requirement = Requirement {
        name: "tool",
        probe: Probe::Command {
            program: "tool",
            args: &["--version"],
        },
        fix: "install tool",
    };

    const OTHER: Requirement = Requirement {
        name: "other",
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

        let finding = examine(&TOOL, &machine);

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

        let finding = examine(&TOOL, &machine);

        assert_eq!(finding, Finding::Missing);
    }

    #[test]
    fn report_counts_missing_tools_and_shows_how_to_fix_them() {
        let machine = FakeMachine {
            installed: &[("tool", "tool 1.2.3")],
        };

        let report = render(&[TOOL, OTHER], &machine);

        assert_eq!(report.missing, 1);
        assert!(report.lines[0].contains("tool 1.2.3"));
        assert!(report.lines[1].contains("install other"));
    }
}
