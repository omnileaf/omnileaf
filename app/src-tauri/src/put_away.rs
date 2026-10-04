//! What the app saves as it is put away, closed or sent to the background, while the system may stop it at any moment after.

use std::time::Duration;

use omnileaf_engine::{Library, LibraryError, describe_error};
use tauri::{AppHandle, Manager, RunEvent};
use tokio::time::{error::Elapsed, timeout};

/// Short enough that waiting on a busy database never holds up the system putting the app away.
const SAVE_LIMIT: Duration = Duration::from_secs(2);

/// Saves the page the reader showed last, waiting for the save so it is written before the app can be stopped.
pub(crate) fn save_when_put_away(app: &AppHandle, event: &RunEvent) {
    if !is_put_away(event) {
        return;
    }
    let Some(library) = app.try_state::<Library>() else {
        return;
    };
    match tauri::async_runtime::block_on(save_in_time(library.save_reading())) {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            tracing::warn!(error = %describe_error(&error), "save the page reading reached as the app is put away");
        }
        Err(_) => {
            tracing::warn!(limit = ?SAVE_LIMIT, "stop waiting for the page reading reached to save as the app is put away");
        }
    }
}

async fn save_in_time(
    save: impl Future<Output = Result<(), LibraryError>>,
) -> Result<Result<(), LibraryError>, Elapsed> {
    timeout(SAVE_LIMIT, save).await
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

    #[tokio::test(start_paused = true)]
    async fn stops_waiting_for_a_save_that_takes_too_long() {
        let started = tokio::time::Instant::now();

        let saved = save_in_time(std::future::pending()).await;

        assert!(saved.is_err());
        assert_eq!(started.elapsed(), SAVE_LIMIT);
    }
}
