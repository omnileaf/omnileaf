//! Regenerates the licences of the packages the app ships, or checks the committed Rust ones are current.

use std::{fs, io, path::Path, process::Command};

use anyhow::Context;

use crate::{licence_catalogue::catalogue, process};

const APP_MANIFEST: &str = "app/src-tauri/Cargo.toml";
const ABOUT_CONFIG: &str = "about.toml";
const RUST_CATALOGUE: &str = "app/src/lib/licences/rust.json";
const JAVASCRIPT_UPDATE_REQUEST: &str = "UPDATE_LICENCES";

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
    let fetched = Command::new("cargo")
        .args(["fetch", "--locked"])
        .current_dir(root)
        .status()
        .context("fetch the crates")?;
    anyhow::ensure!(fetched.success(), "fetching the crates failed");
    let output = Command::new("cargo")
        .args([
            "about", "generate", "--format", "json", "--frozen", "--fail",
        ])
        .args(["--manifest-path", APP_MANIFEST, "--config", ABOUT_CONFIG])
        .current_dir(root)
        .output()
        .context("run cargo-about")?;
    anyhow::ensure!(
        output.status.success(),
        "cargo-about failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).context("read cargo-about's report")
}
