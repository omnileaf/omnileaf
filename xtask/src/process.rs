//! Runs gate steps as child processes in the workspace root.

use std::{io, path::PathBuf, process::Command};

use crate::check::{Runner, Step};

pub(crate) struct Process {
    root: PathBuf,
}

impl Process {
    pub(crate) fn in_workspace() -> Self {
        Self {
            root: PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/..")),
        }
    }
}

impl Runner for Process {
    #[expect(clippy::print_stdout, reason = "progress output for the developer")]
    fn run(&self, step: &Step) -> io::Result<bool> {
        println!("==> {}", step.name);
        Command::new(step.program)
            .args(step.args)
            .current_dir(&self.root)
            .status()
            .map(|status| status.success())
    }
}
