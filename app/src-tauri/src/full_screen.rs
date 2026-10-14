#[cfg(any(target_os = "macos", test))]
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use specta::Type;

use crate::ipc_error::IpcError;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FullScreenChange {
    Toggle,
    Leave,
}

impl FullScreenChange {
    #[cfg_attr(
        all(mobile, not(test)),
        expect(
            dead_code,
            reason = "a phone or tablet app has no window to fill the screen with"
        )
    )]
    fn is_full_screen_after(self, is_full_screen: bool) -> bool {
        match self {
            Self::Toggle => !is_full_screen,
            Self::Leave => false,
        }
    }
}

/// Follows the window in and out of full screen, to tell when it has just come back to a window.
#[cfg(any(target_os = "macos", test))]
#[derive(Default)]
pub(crate) struct FullScreenWatch {
    was_full_screen: AtomicBool,
}

#[cfg(any(target_os = "macos", test))]
impl FullScreenWatch {
    pub(crate) fn has_left(&self, is_full_screen: bool) -> bool {
        let was_full_screen = self.was_full_screen.swap(is_full_screen, Ordering::SeqCst);
        was_full_screen && !is_full_screen
    }
}

/// Gives the page back the keys once the window leaves full screen, which tao hands to its own view behind the page as the window's style comes back.
///
/// Tao queues that hand-over on the main queue as the window leaves, so the page takes the keys back in a job queued after it.
#[cfg(target_os = "macos")]
pub(crate) fn keep_keys_on_leaving(window: &tauri::Window, event: &tauri::WindowEvent) {
    use tauri::Manager;

    if !matches!(event, tauri::WindowEvent::Resized(_)) {
        return;
    }
    let is_full_screen = match window.is_fullscreen() {
        Ok(is_full_screen) => is_full_screen,
        Err(error) => {
            tracing::warn!(%error, "tell whether the window is in full screen");
            return;
        }
    };
    if !window.state::<FullScreenWatch>().has_left(is_full_screen) {
        return;
    }
    let webviews = window.webviews();
    dispatch2::DispatchQueue::main().exec_async(move || {
        for webview in webviews {
            if let Err(error) = webview.set_focus() {
                tracing::warn!(%error, "give the keys back to the page after full screen");
            }
        }
    });
}

#[cfg(desktop)]
pub(crate) fn change(
    window: &tauri::WebviewWindow,
    change: FullScreenChange,
) -> Result<bool, IpcError> {
    let was_full_screen = window
        .is_fullscreen()
        .map_err(|error| IpcError::internal(&error))?;
    window
        .set_fullscreen(change.is_full_screen_after(was_full_screen))
        .map_err(|error| IpcError::internal(&error))?;
    Ok(was_full_screen)
}

#[cfg(mobile)]
#[expect(
    clippy::unnecessary_wraps,
    reason = "a desktop window can fail to change, so every platform answers with a result"
)]
pub(crate) fn change(
    _window: &tauri::WebviewWindow,
    _change: FullScreenChange,
) -> Result<bool, IpcError> {
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{FullScreenChange, FullScreenWatch};

    #[test]
    fn tells_only_when_the_window_has_just_left_full_screen() {
        let watch = FullScreenWatch::default();

        let left =
            [false, true, true, false, false].map(|is_full_screen| watch.has_left(is_full_screen));

        assert_eq!(left, [false, false, false, true, false]);
    }

    #[test]
    fn toggles_between_a_window_and_full_screen() {
        let after = [false, true]
            .map(|is_full_screen| FullScreenChange::Toggle.is_full_screen_after(is_full_screen));

        assert_eq!(after, [true, false]);
    }

    #[test]
    fn leaves_full_screen_for_a_window_whatever_it_was() {
        let after = [false, true]
            .map(|is_full_screen| FullScreenChange::Leave.is_full_screen_after(is_full_screen));

        assert_eq!(after, [false, false]);
    }
}
