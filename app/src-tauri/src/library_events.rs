use omnileaf_engine::{BookId, Library, LibraryChanges, SeriesId};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, async_runtime::JoinHandle};
use tauri_specta::Event;
use tokio::sync::broadcast::{self, error::RecvError};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, Event)]
pub(crate) struct LibraryChanged;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, Event)]
pub(crate) struct ReadingSaved {
    book: BookId,
    series: SeriesId,
}

pub(crate) struct LibraryChangesForwarding {
    _changes: JoinHandle<()>,
    _saves: JoinHandle<()>,
}

impl LibraryChangesForwarding {
    pub(crate) fn start(app: AppHandle, library: &Library) -> Self {
        let changes = library.changes();
        let saves = library.reading_saved();
        Self {
            _changes: tauri::async_runtime::spawn(forward(app.clone(), changes)),
            _saves: tauri::async_runtime::spawn(forward_saves(app, saves)),
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

async fn forward_saves(
    app: AppHandle,
    mut saves: broadcast::Receiver<omnileaf_engine::ReadingSaved>,
) {
    loop {
        let emitted = match saves.recv().await {
            Ok(omnileaf_engine::ReadingSaved { book, series }) => {
                ReadingSaved { book, series }.emit(&app)
            }
            Err(RecvError::Lagged(missed)) => {
                tracing::debug!(missed, "fell behind the pages reading saved");
                LibraryChanged.emit(&app)
            }
            Err(RecvError::Closed) => return,
        };
        if let Err(error) = emitted {
            tracing::warn!(%error, "tell the interface a page reading reached was saved");
        }
    }
}
