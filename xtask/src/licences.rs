//! Regenerates the licences of the Rust crates the app ships, or checks the committed ones are current.

use std::{fs, path::Path, process::Command};

use anyhow::Context;

use crate::licence_catalogue::catalogue;

const APP_MANIFEST: &str = "app/src-tauri/Cargo.toml";
const ABOUT_CONFIG: &str = "about.toml";
const RUST_CATALOGUE: &str = "app/src/lib/licences/rust.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    Write,
    Check,
}

pub(crate) fn regenerate(root: &Path, mode: Mode) -> anyhow::Result<()> {
    let report = cargo_about_report(root)?;
    let catalogue = catalogue(&report).context("list the Rust crates' licences")?;
    let generated = format!("{}\n", serde_json::to_string_pretty(&catalogue)?);
    let path = root.join(RUST_CATALOGUE);
    match mode {
        Mode::Write => {
            fs::write(&path, generated).with_context(|| format!("write {}", path.display()))
        }
        Mode::Check => {
            let committed = fs::read_to_string(&path).unwrap_or_default();
            anyhow::ensure!(
                committed == generated,
                "{RUST_CATALOGUE} is out of date; run `cargo xtask licences`"
            );
            Ok(())
        }
    }
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
