use std::{env, fs, io, path::Path, process::Command};

use anyhow::Context;

use crate::{licence_catalogue::catalogue, process};

const APP_MANIFEST: &str = "app/src-tauri/Cargo.toml";
const ABOUT_CONFIG: &str = "about.toml";
const RUST_CATALOGUE: &str = "app/src/lib/licences/rust.json";
const JAVASCRIPT_UPDATE_REQUEST: &str = "UPDATE_LICENCES";
const CARGO_ABOUT_VERSION: &str = "0.9.2";
pub(crate) const INSTALL_CARGO_ABOUT: &str = "cargo install --locked cargo-about@0.9.2";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    Write,
    Check,
}

/// The interface build checks the JavaScript licences itself, so checking covers the Rust ones only.
pub(crate) fn regenerate(root: &Path, mode: Mode) -> anyhow::Result<()> {
    let report = cargo_about_report(root)?;
    let catalogue = catalogue(&report).context("list the Rust crates' licences")?;
    let generated = format!("{}\n", serde_json::to_string_pretty(&catalogue)?);
    let path = root.join(RUST_CATALOGUE);
    match mode {
        Mode::Write => {
            fs::write(&path, generated).with_context(|| format!("write {}", path.display()))?;
            write_javascript_catalogue(root)
        }
        Mode::Check => {
            anyhow::ensure!(
                committed(&path)?.as_deref() == Some(generated.as_str()),
                "{RUST_CATALOGUE} is out of date; run `cargo xtask licences`"
            );
            Ok(())
        }
    }
}

fn committed(path: &Path) -> anyhow::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {}", path.display())),
    }
}

fn write_javascript_catalogue(root: &Path) -> anyhow::Result<()> {
    let status = process::command_for("pnpm")
        .args(["--dir", "app", "build"])
        .env(JAVASCRIPT_UPDATE_REQUEST, "1")
        .current_dir(root)
        .status()
        .context("build the interface")?;
    anyhow::ensure!(status.success(), "building the interface failed");
    Ok(())
}

/// Fetches every target's crates first, so cargo-about can stay offline and never
/// fill a missing licence from the network, which would make its report vary.
fn cargo_about_report(root: &Path) -> anyhow::Result<String> {
    ensure_pinned_cargo_about(root)?;
    let fetched = Command::new("cargo")
        .args(["fetch", "--locked"])
        .current_dir(root)
        .status()
        .context("fetch the crates")?;
    anyhow::ensure!(fetched.success(), "fetching the crates failed");
    let report_path =
        env::temp_dir().join(format!("omnileaf-cargo-about-{}.json", std::process::id()));
    take_report(&report_path, |path| write_cargo_about_report(root, path))
}

fn write_cargo_about_report(root: &Path, path: &Path) -> anyhow::Result<()> {
    let output = Command::new("cargo")
        .args([
            "about", "generate", "--format", "json", "--frozen", "--fail",
        ])
        .args(["--manifest-path", APP_MANIFEST, "--config", ABOUT_CONFIG])
        .arg("--output-file")
        .arg(path)
        .current_dir(root)
        .output()
        .context("run cargo-about")?;
    anyhow::ensure!(
        output.status.success(),
        "cargo-about failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}

/// Reads the report `write` leaves at `path`, and removes it whether or not `write` succeeds.
fn take_report(
    path: &Path,
    write: impl FnOnce(&Path) -> anyhow::Result<()>,
) -> anyhow::Result<String> {
    let report =
        write(path).and_then(|()| fs::read_to_string(path).context("read cargo-about's report"));
    let removed = remove_if_present(path);
    report.and_then(|report| removed.map(|()| report))
}

fn remove_if_present(path: &Path) -> anyhow::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => {
            Err(error).with_context(|| format!("remove {}", path.display()))
        }
        _ => Ok(()),
    }
}

fn is_pinned_cargo_about(version_output: &str) -> bool {
    version_output.split_whitespace().nth(1) == Some(CARGO_ABOUT_VERSION)
}

/// The committed catalogue is compared byte for byte, and other cargo-about releases word it differently.
fn ensure_pinned_cargo_about(root: &Path) -> anyhow::Result<()> {
    let output = Command::new("cargo")
        .args(["about", "--version"])
        .current_dir(root)
        .output()
        .context("ask cargo-about for its version")?;
    let reported = String::from_utf8_lossy(&output.stdout);
    anyhow::ensure!(
        output.status.success() && is_pinned_cargo_about(&reported),
        "the licences need cargo-about {CARGO_ABOUT_VERSION}, found `{}`; run `{INSTALL_CARGO_ABOUT}`",
        reported.trim()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report_path(name: &str) -> std::path::PathBuf {
        env::temp_dir().join(format!("omnileaf-xtask-{name}-{}.json", std::process::id()))
    }

    #[test]
    fn takes_the_written_report_and_removes_its_file() {
        let path = report_path("written-report");

        let report = take_report(&path, |path| Ok(fs::write(path, "{}")?)).unwrap();

        assert_eq!(report, "{}");
        assert!(!path.exists());
    }

    #[test]
    fn removes_a_partly_written_report_when_writing_it_fails() {
        let path = report_path("failed-report");

        let taken = take_report(&path, |path| {
            fs::write(path, "{")?;
            anyhow::bail!("cargo-about failed")
        });

        assert_eq!(taken.unwrap_err().to_string(), "cargo-about failed");
        assert!(!path.exists());
    }

    #[test]
    fn reports_the_failure_when_writing_leaves_no_report() {
        let path = report_path("missing-report");

        let taken = take_report(&path, |_| anyhow::bail!("cargo-about failed"));

        assert_eq!(taken.unwrap_err().to_string(), "cargo-about failed");
    }

    #[test]
    fn accepts_the_pinned_cargo_about() {
        assert!(is_pinned_cargo_about("cargo-about 0.9.2\n"));
    }

    #[test]
    fn rejects_any_other_cargo_about() {
        assert!(!is_pinned_cargo_about("cargo-about 0.9.20\n"));
        assert!(!is_pinned_cargo_about("cargo-about 0.10.0\n"));
    }
}
