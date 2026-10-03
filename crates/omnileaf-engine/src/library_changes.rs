//! Changes to what the library lists, told once for each burst of them.

use std::time::Duration;

use omnileaf_db::store::Changed;
use tokio::sync::broadcast::{
    self,
    error::{RecvError, TryRecvError},
};

/// How long a change waits for the ones close behind it, so a scan of many batches refreshes a list a few times a second at most.
pub const LIBRARY_CHANGES_GATHERED_FOR: Duration = Duration::from_millis(250);

/// Something the library lists changed: series came, went, changed or sort in a new order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LibraryChanged;

#[derive(Clone, Copy, Debug)]
pub(crate) struct CatalogWritten;

pub struct LibraryChanges {
    pub(crate) catalog: broadcast::Receiver<CatalogWritten>,
    pub(crate) synced: broadcast::Receiver<Changed>,
}

enum Heard {
    Change,
    Unrelated,
    Closed,
}

impl LibraryChanges {
    /// Waits for a change, then folds every other made within [`LIBRARY_CHANGES_GATHERED_FOR`] into it, ending once the library is gone.
    pub async fn next(&mut self) -> Option<LibraryChanged> {
        loop {
            let heard = tokio::select! {
                written = self.catalog.recv() => heard_catalog(&written),
                changed = self.synced.recv() => heard_synced(&changed),
            };
            match heard {
                Heard::Change => break,
                Heard::Unrelated => {}
                Heard::Closed => return None,
            }
        }
        tokio::time::sleep(LIBRARY_CHANGES_GATHERED_FOR).await;
        self.skip_waiting();
        Some(LibraryChanged)
    }

    fn skip_waiting(&mut self) {
        while !matches!(
            self.catalog.try_recv(),
            Err(TryRecvError::Empty | TryRecvError::Closed)
        ) {}
        while !matches!(
            self.synced.try_recv(),
            Err(TryRecvError::Empty | TryRecvError::Closed)
        ) {}
    }
}

fn heard_catalog(written: &Result<CatalogWritten, RecvError>) -> Heard {
    match written {
        Ok(CatalogWritten) | Err(RecvError::Lagged(_)) => Heard::Change,
        Err(RecvError::Closed) => Heard::Closed,
    }
}

/// Reading positions and marks don't change what the library lists yet, so only a new title order counts.
fn heard_synced(changed: &Result<Changed, RecvError>) -> Heard {
    match changed {
        Ok(Changed::TitleOrder) | Err(RecvError::Lagged(_)) => Heard::Change,
        Ok(Changed::Registers { .. }) => Heard::Unrelated,
        Err(RecvError::Closed) => Heard::Closed,
    }
}
