use std::{env, path::Path};

const WINDOWS_MANIFEST: &str = "windows-app-manifest.xml";

#[expect(
    clippy::expect_used,
    reason = "a build script reports failure by panicking"
)]
fn main() {
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        embed_manifest_in_every_target();
    }
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("run tauri-build");
}

/// Tauri embeds its manifest in the app executable only, and test binaries
/// that link Tauri won't start on Windows without it.
fn embed_manifest_in_every_target() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join(WINDOWS_MANIFEST);
    println!("cargo:rerun-if-changed={WINDOWS_MANIFEST}");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
