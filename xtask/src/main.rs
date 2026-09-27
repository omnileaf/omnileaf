//! Repository automation, run as `cargo xtask <command>`.

mod check;
mod doctor;
mod policy;
mod process;
mod workspace;

use std::fmt::Display;

use anyhow::Context;
use clap::{Parser, Subcommand};

use crate::{policy::RepositoryFile, process::Process};

#[derive(Parser)]
#[command(about = "Repository automation for Omnileaf")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the checks CI runs on every pull request.
    Check {
        /// Run only this group of checks.
        #[arg(long, value_enum)]
        only: Option<check::Group>,
    },
    /// Check that this machine has the tools the repository needs.
    Doctor,
    /// Check the repository's files against its content rules.
    Policy,
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Check { only } => {
            check::run_all(check::select(check::STEPS, only), &Process::in_workspace())?;
        }
        Command::Doctor => {
            let report = doctor::render(
                doctor::REQUIREMENTS,
                &Process::in_workspace(),
                std::env::consts::OS,
            );
            print_lines(&report.lines);
            anyhow::ensure!(report.missing == 0, "{} tool(s) missing", report.missing);
        }
        Command::Policy => enforce_policy()?,
    }
    Ok(())
}

fn enforce_policy() -> anyhow::Result<()> {
    let root = workspace::root();
    let files = workspace::repository_files(&root).context("read the repository files")?;
    let rules = workspace::policy(&root).context("read the policy lists")?;
    let repository: Vec<RepositoryFile<'_>> = files
        .iter()
        .map(|(path, bytes)| RepositoryFile { path, bytes })
        .collect();
    let violations = policy::check(&repository, &rules);
    print_lines(&violations);
    anyhow::ensure!(
        violations.is_empty(),
        "{} policy violation(s)",
        violations.len()
    );
    Ok(())
}

#[expect(clippy::print_stdout, reason = "the report is the command's output")]
fn print_lines(lines: &[impl Display]) {
    for line in lines {
        println!("{line}");
    }
}
