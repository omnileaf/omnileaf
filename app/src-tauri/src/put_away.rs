//! What the app saves as it is put away, closed, sent to the background or its window left out of use, while the system may stop it at any moment after.

use std::time::Duration;

use omnileaf_engine::{Library, LibraryError, describe_error};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tokio::time::{error::Elapsed, timeout};

/// Short enough that waiting on a busy database never holds up the system putting the app away.
const SAVE_LIMIT: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PutAway {
    /// The process ends once the event returns, so the save is waited for.
    Exiting,
    /// The app goes to the background, or its window out of use, and the delayed save backs this one up, so the UI thread never waits.
    Backgrounded,
}

impl PutAway {
    fn of(event: &RunEvent) -> Option<Self> {
        match event {
            RunEvent::Exit => Some(Self::Exiting),
            RunEvent::WindowEvent { event, .. } => Self::of_window(event),
            _ => None,
        }
    }

    fn of_window(event: &WindowEvent) -> Option<Self> {
        match event {
            #[cfg(mobile)]
            WindowEvent::Suspended => Some(Self::Backgrounded),
            #[cfg(desktop)]
            WindowEvent::Focused(false) => Some(Self::Backgrounded),
            _ => None,
        }
    }

    const fn waits_for_the_save(self) -> bool {
        match self {
            Self::Exiting => true,
            Self::Backgrounded => false,
        }
    }
}

/// Saves the page the reader showed last, waiting for the save only when the app exits.
pub(crate) fn save_when_put_away(app: &AppHandle, event: &RunEvent) {
    let Some(put_away) = PutAway::of(event) else {
        return;
    };
    if put_away.waits_for_the_save() {
        if let Some(library) = app.try_state::<Library>() {
            warn_unless_saved(tauri::async_runtime::block_on(save_in_time(
                library.save_reading(),
            )));
        }
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(library) = app.try_state::<Library>() {
            warn_unless_saved(save_in_time(library.save_reading()).await);
        }
    });
}

fn warn_unless_saved(saved: Result<Result<(), LibraryError>, Elapsed>) {
    match saved {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_app_exiting_as_put_away() {
        let events = [RunEvent::Exit, RunEvent::Ready, RunEvent::MainEventsCleared];

        let put_away = events.map(|event| PutAway::of(&event));

        assert_eq!(put_away, [Some(PutAway::Exiting), None, None]);
    }

    #[cfg(desktop)]
    #[test]
    fn counts_the_window_going_out_of_use_as_put_away_on_desktop() {
        let events = [WindowEvent::Focused(false), WindowEvent::Focused(true)];

        let put_away = events.map(|event| PutAway::of_window(&event));

        assert_eq!(put_away, [Some(PutAway::Backgrounded), None]);
    }

    #[test]
    fn waits_for_the_save_only_as_the_app_exits() {
        let waits = [PutAway::Exiting, PutAway::Backgrounded].map(PutAway::waits_for_the_save);

        assert_eq!(waits, [true, false]);
    }

    #[tokio::test(start_paused = true)]
    async fn stops_waiting_for_a_save_that_takes_too_long() {
        let started = tokio::time::Instant::now();

        let saved = save_in_time(std::future::pending()).await;

        assert!(saved.is_err());
        assert_eq!(started.elapsed(), SAVE_LIMIT);
    }
}
