//! The Tauri shell, a thin adapter between the platform's webview and the Rust core.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[expect(
    clippy::expect_used,
    reason = "without its runtime the app has nothing to fall back to"
)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("start the Tauri runtime");
}
