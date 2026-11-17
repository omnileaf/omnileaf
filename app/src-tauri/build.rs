#[path = "build/release_notes.rs"]
mod release_notes;

use std::{env, fs, io, path::Path};

const WINDOWS_MANIFEST: &str = "windows-app-manifest.xml";
const CHANGES_FOLDER: &str = "../../.changes";
const RELEASED_FOLDER: &str = "released";
const RELEASE_NOTES_BUNDLE: &str = "release_notes.json";

#[expect(
    clippy::expect_used,
    reason = "a build script reports failure by panicking"
)]
fn main() {
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        embed_manifest_in_every_target();
    }
    bundle_release_notes();
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

#[expect(
    clippy::expect_used,
    reason = "a build script reports failure by panicking"
)]
fn bundle_release_notes() {
    let changes = Path::new(env!("CARGO_MANIFEST_DIR")).join(CHANGES_FOLDER);
    let released = changes.join(RELEASED_FOLDER);
    let watched = if released.is_dir() {
        &released
    } else {
        &changes
    };
    println!("cargo:rerun-if-changed={}", watched.display());
    let notes = release_notes::read_released(&released).expect("bundle the released notes");
    let bundle = serde_json::to_string(&notes).expect("write the released notes as JSON");
    let out_dir = env::var("OUT_DIR").expect("cargo sets OUT_DIR");
    let bundle_path = Path::new(&out_dir).join(RELEASE_NOTES_BUNDLE);
    write_when_changed(&bundle_path, &bundle).expect("write the release notes bundle");
    println!(
        "cargo:rustc-env=OMNILEAF_RELEASE_NOTES={}",
        bundle_path.display()
    );
}

fn write_when_changed(path: &Path, contents: &str) -> io::Result<()> {
    if fs::read_to_string(path).is_ok_and(|current| current == contents) {
        return Ok(());
    }
    fs::write(path, contents)
}
