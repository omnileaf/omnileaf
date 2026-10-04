//! What the app saves as it is put away, closed or sent to the background, while the system may stop it at any moment after.

use omnileaf_engine::{Library, describe_error};
use tauri::{AppHandle, Manager, RunEvent};

/// Saves the page the reader showed last, waiting for the save so it is written before the app can be stopped.
pub(crate) fn save_when_put_away(app: &AppHandle, event: &RunEvent) {
    if !is_put_away(event) {
        return;
    }
    let Some(library) = app.try_state::<Library>() else {
        return;
    };
    if let Err(error) = tauri::async_runtime::block_on(library.save_reading()) {
        tracing::warn!(error = %describe_error(&error), "save the page reading reached as the app is put away");
    }
}

fn is_put_away(event: &RunEvent) -> bool {
    match event {
        RunEvent::Exit => true,
        #[cfg(mobile)]
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::Suspended,
            ..
        } => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_app_exiting_as_put_away() {
        let events = [RunEvent::Exit, RunEvent::Ready, RunEvent::MainEventsCleared];

        let put_away = events.map(|event| is_put_away(&event));

        assert_eq!(put_away, [true, false, false]);
    }
}
