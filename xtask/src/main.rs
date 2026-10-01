//! Repository automation, run as `cargo xtask <command>`.

mod check;
mod doctor;
mod fixtures;
mod icons;
mod policy;
mod process;
mod workspace;

use std::{fmt::Display, path::PathBuf};

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
    /// Regenerate the interface's TypeScript bindings from the app's commands.
    Bindings,
    /// Check that this machine has the tools the repository needs.
    Doctor,
    /// Generate the test fixtures, replacing any from an earlier run.
    Fixtures {
        /// The folder to write them into, relative to the workspace root.
        #[arg(long, default_value = "target/fixtures")]
        out: PathBuf,
    },
    /// Regenerate the app icons from `branding/icon.json`.
    Icons,
    /// Check the repository's files against its content rules.
    Policy,
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Check { only } => {
            check::run_all(check::select(check::STEPS, only), &Process::in_workspace())?;
        }
        Command::Bindings => regenerate_bindings()?,
        Command::Doctor => {
            let report = doctor::render(
                doctor::REQUIREMENTS,
                &Process::in_workspace(),
                std::env::consts::OS,
            );
            print_lines(&report.lines);
            anyhow::ensure!(report.missing == 0, "{} tool(s) missing", report.missing);
        }
        Command::Fixtures { out } => {
            let out = workspace::root().join(out);
            let written = fixtures::generate(&out)?;
            print_lines(&[format!(
                "wrote {} fixture files to {}",
                written.len(),
                out.display()
            )]);
        }
        Command::Icons => icons::regenerate(&workspace::root())?,
        Command::Policy => enforce_policy()?,
    }
    Ok(())
}

fn regenerate_bindings() -> anyhow::Result<()> {
    let status = std::process::Command::new("cargo")
        .args([
            "test",
            "--quiet",
            "--locked",
            "--package",
            "omnileaf-app",
            "--lib",
            "commands::tests::committed_bindings_match_the_commands",
        ])
        .env("UPDATE_BINDINGS", "1")
        .current_dir(workspace::root())
        .status()
        .context("run the bindings test")?;
    anyhow::ensure!(status.success(), "regenerating the bindings failed");
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
