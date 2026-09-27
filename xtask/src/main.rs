//! Repository automation, run as `cargo xtask <command>`.

mod check;
mod process;

use clap::{Parser, Subcommand};

use crate::process::Process;

#[derive(Parser)]
#[command(about = "Repository automation for Omnileaf")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the checks CI runs on every pull request.
    Check,
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Check => check::run_all(check::STEPS, &Process::in_workspace())?,
    }
    Ok(())
}
