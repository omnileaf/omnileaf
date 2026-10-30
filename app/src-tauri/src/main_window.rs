use omnileaf_engine::WindowBackdrop;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder, Wry};

use crate::window_backdrop;

const MAIN_WINDOW: &str = "main";

type MainWindowBuilder<'a> = WebviewWindowBuilder<'a, Wry, App>;

pub(crate) fn open(app: &App, backdrop: WindowBackdrop) -> tauri::Result<WindowBackdrop> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .ok_or(tauri::Error::WindowNotFound)?;
    let window = if config.create {
        app.get_webview_window(MAIN_WINDOW)
            .ok_or(tauri::Error::WindowNotFound)?
    } else {
        with_backdrop(WebviewWindowBuilder::from_config(app, config)?, backdrop).build()?
    };
    let drawn = window_backdrop::confirmed(backdrop, drawn_backdrop(&window));
    if drawn != backdrop {
        tracing::warn!(asked = ?backdrop, ?drawn, "draw the window backdrop");
    }
    Ok(drawn)
}

fn with_backdrop(window: MainWindowBuilder<'_>, backdrop: WindowBackdrop) -> MainWindowBuilder<'_> {
    match backdrop {
        WindowBackdrop::Mica => with_mica(window),
        WindowBackdrop::None => window,
    }
}

#[cfg(windows)]
fn with_mica(window: MainWindowBuilder<'_>) -> MainWindowBuilder<'_> {
    use tauri::window::{Effect, EffectsBuilder};

    window
        .transparent(true)
        .effects(EffectsBuilder::new().effect(Effect::Mica).build())
}

#[cfg(not(windows))]
fn with_mica(window: MainWindowBuilder<'_>) -> MainWindowBuilder<'_> {
    window
}

#[cfg(windows)]
fn drawn_backdrop(window: &WebviewWindow) -> WindowBackdrop {
    let draws_mica = window.hwnd().is_ok_and(|handle| {
        omnileaf_windows_probes::draws_main_window_backdrop(handle.0.expose_provenance())
    });
    if draws_mica {
        WindowBackdrop::Mica
    } else {
        WindowBackdrop::None
    }
}

#[cfg(not(windows))]
fn drawn_backdrop(_window: &WebviewWindow) -> WindowBackdrop {
    WindowBackdrop::None
}
