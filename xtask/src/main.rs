//! Repository automation, run as `cargo xtask <command>`.

mod android;
mod check;
mod dev;
mod doctor;
mod fixtures;
mod fuzz_seeds;
mod icons;
mod licence_catalogue;
mod licences;
mod lint_sync;
mod policy;
mod pre_push;
mod process;
mod workspace;

use std::{
    fmt::Display,
    path::{Path, PathBuf},
};

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
    /// Run the app on the desktop and phones at once, sharing one dev server.
    Dev {
        /// The platforms to run; every one this machine can build for when left out.
        #[arg(long = "platform", value_enum, num_args = 1.., value_delimiter = ',')]
        platforms: Vec<dev::Platform>,
        /// The iOS Simulator or device to run on, by name.
        #[arg(long)]
        ios_device: Option<String>,
        /// The Android device or emulator to run on, by name.
        #[arg(long)]
        android_device: Option<String>,
    },
    /// Check that this machine has the tools the repository needs.
    Doctor,
    /// Generate the test fixtures, replacing any from an earlier run.
    Fixtures {
        /// The folder to write them into, relative to the workspace root.
        #[arg(long, default_value = "target/fixtures")]
        out: PathBuf,
    },
    /// Write the fuzz targets' seed inputs into `fuzz/corpus`.
    FuzzSeeds,
    /// Regenerate the app icons from `branding/icon.json`.
    Icons,
    /// Regenerate the licences the app's licences page lists, from the crates it ships.
    Licences {
        /// Only check that the committed licences are current.
        #[arg(long)]
        check: bool,
    },
    /// Check that only the write path writes synced state and the projections built from it.
    LintSync,
    /// Check the repository's files against its content rules.
    Policy,
    /// Run the quick checks for what a push changes; git calls this from `.githooks/pre-push`.
    PrePush {
        /// The remote git is pushing to.
        remote: String,
        /// The remote's address, which git passes after its name.
        url: Option<String>,
    },
    /// Have git run the repository's hooks, so a push is checked before it leaves.
    InstallHooks,
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Check { only } => {
            check::run_all(check::select(check::STEPS, only), &Process::in_workspace())?;
        }
        Command::Bindings => regenerate_bindings()?,
        Command::Dev {
            platforms,
            ios_device,
            android_device,
        } => {
            let platforms = if platforms.is_empty() {
                dev::platforms_for(std::env::consts::OS)
            } else {
                platforms
            };
            let devices = dev::Devices {
                ios: ios_device,
                android: android_device,
            };
            dev::run(&workspace::root(), &platforms, &devices)?;
        }
        Command::Doctor => {
            let os = std::env::consts::OS;
            let android = android::Toolchain::locate(|key| std::env::var_os(key), os);
            let host = doctor::Host {
                os,
                android: android.as_ref(),
            };
            let report = doctor::render(doctor::REQUIREMENTS, &Process::in_workspace(), &host);
            print_lines(&report.lines);
            if report.missing_for_phones > 0 {
                print_lines(&[format!(
                    "{} tool(s) for running the app on phones missing",
                    report.missing_for_phones
                )]);
            }
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
        Command::FuzzSeeds => {
            let corpus = workspace::root().join(fuzz_seeds::CORPUS);
            let written = fuzz_seeds::generate(&corpus)?;
            print_lines(&[format!(
                "wrote {} seeds to {}",
                written.len(),
                corpus.display()
            )]);
        }
        Command::Icons => icons::regenerate(&workspace::root())?,
        Command::Licences { check } => {
            let mode = if check {
                licences::Mode::Check
            } else {
                licences::Mode::Write
            };
            licences::regenerate(&workspace::root(), mode)?;
        }
        Command::LintSync => lint_sync()?,
        Command::Policy => enforce_policy()?,
        Command::PrePush { remote, .. } => {
            let pushed =
                std::io::read_to_string(std::io::stdin()).context("read the pushed refs")?;
            pre_push::run(
                &workspace::root(),
                &remote,
                &pushed,
                &Process::in_workspace(),
            )?;
        }
        Command::InstallHooks => pre_push::install_hooks(&workspace::root())?,
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
    let rules = workspace::policy(&root).context("read the policy lists")?;
    let violations = check_repository(&root, |files| policy::check(files, &rules))?;
    report(&violations, "policy")
}

fn lint_sync() -> anyhow::Result<()> {
    let violations = check_repository(&workspace::root(), lint_sync::check)?;
    report(&violations, "sync rule")
}

fn check_repository<V>(
    root: &Path,
    check: impl FnOnce(&[RepositoryFile<'_>]) -> Vec<V>,
) -> anyhow::Result<Vec<V>> {
    let files = workspace::repository_files(root).context("read the repository files")?;
    let repository: Vec<RepositoryFile<'_>> = files
        .iter()
        .map(|(path, bytes)| RepositoryFile { path, bytes })
        .collect();
    Ok(check(&repository))
}

fn report(violations: &[impl Display], rule: &str) -> anyhow::Result<()> {
    print_lines(violations);
    anyhow::ensure!(
        violations.is_empty(),
        "{} {rule} violation(s)",
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

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::{Cli, Command};
    use crate::dev::Platform;

    fn parsed_platforms(args: &[&str]) -> Vec<Platform> {
        let cli = Cli::try_parse_from(["xtask", "dev"].iter().chain(args)).unwrap();
        let Command::Dev { platforms, .. } = cli.command else {
            panic!("parsed a command other than dev");
        };
        platforms
    }

    #[test]
    fn takes_several_platforms_after_one_flag() {
        for args in [
            &["--platform", "ios", "android"][..],
            &["--platform", "ios,android"],
            &["--platform", "ios", "--platform", "android"],
        ] {
            assert_eq!(
                parsed_platforms(args),
                [Platform::Ios, Platform::Android],
                "{args:?}"
            );
        }
    }
}
