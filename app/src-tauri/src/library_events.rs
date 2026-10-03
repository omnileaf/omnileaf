//! The events that tell the interface its library changed underneath it.

use omnileaf_engine::{Library, LibraryChanges};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, async_runtime::JoinHandle};
use tauri_specta::Event;

/// Series came, went, changed or sort in a new order, so a list of them should be read again.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, Event)]
pub(crate) struct LibraryChanged;

/// Forwards every library change to the interface for as long as the app runs.
pub(crate) struct LibraryChangesForwarding {
    _task: JoinHandle<()>,
}

impl LibraryChangesForwarding {
    pub(crate) fn start(app: AppHandle, library: &Library) -> Self {
        let changes = library.changes();
        Self {
            _task: tauri::async_runtime::spawn(forward(app, changes)),
        }
    }
}

async fn forward(app: AppHandle, mut changes: LibraryChanges) {
    while changes.next().await.is_some() {
        if let Err(error) = LibraryChanged.emit(&app) {
            tracing::warn!(%error, "tell the interface the library changed");
        }
    }
}
