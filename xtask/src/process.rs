//! Runs gate steps and tool probes as child processes in the workspace root.

use std::{
    io,
    path::PathBuf,
    process::{Command, Stdio},
};

use crate::{
    check::{Runner, Step},
    doctor::Machine,
};

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

impl Machine for Process {
    fn first_line_of(&self, program: &str, args: &[&str]) -> Option<String> {
        let output = Command::new(program)
            .args(args)
            .current_dir(&self.root)
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|output| output.status.success())?;
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|line| line.trim().to_owned())
    }
}
