//! Repository automation, run as `cargo xtask <command>`.

mod check;
mod doctor;
mod process;

use clap::{Parser, Subcommand};

use crate::{doctor::Report, process::Process};

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
    /// Check that this machine has the tools the repository needs.
    Doctor,
}

fn main() -> anyhow::Result<()> {
    let machine = Process::in_workspace();
    match Cli::parse().command {
        Command::Check => check::run_all(check::STEPS, &machine)?,
        Command::Doctor => {
            let report = doctor::render(doctor::REQUIREMENTS, &machine);
            print_report(&report);
            anyhow::ensure!(report.missing == 0, "{} tool(s) missing", report.missing);
        }
    }
    Ok(())
}

#[expect(clippy::print_stdout, reason = "the report is the command's output")]
fn print_report(report: &Report) {
    for line in &report.lines {
        println!("{line}");
    }
}
