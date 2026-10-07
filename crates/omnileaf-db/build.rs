#[path = "build/icu_versions.rs"]
mod icu_versions;

use std::{fs, path::Path};

const WORKSPACE_LOCKFILE: &str = "../../Cargo.lock";

#[expect(
    clippy::expect_used,
    reason = "a build script reports failure by panicking"
)]
fn main() {
    let lockfile = Path::new(env!("CARGO_MANIFEST_DIR")).join(WORKSPACE_LOCKFILE);
    println!("cargo:rerun-if-changed={}", lockfile.display());
    let lock = fs::read_to_string(&lockfile).expect("read the workspace's Cargo.lock");
    println!(
        "cargo:rustc-env=OMNILEAF_ICU_VERSIONS={}",
        icu_versions::icu_versions(&lock)
    );
}
