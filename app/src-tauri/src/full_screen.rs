//! Puts the app's window in full screen for reading, on the platforms whose windows have one.

use serde::Deserialize;
use specta::Type;

use crate::ipc_error::IpcError;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FullScreenChange {
    /// Goes into full screen from a window, and back out of it.
    Toggle,
    /// Goes back to a window, as when the reader closes.
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
    use super::FullScreenChange;

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
