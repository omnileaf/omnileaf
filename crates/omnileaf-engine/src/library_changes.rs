use std::time::Duration;

use omnileaf_db::store::{Changed, Key};
use tokio::sync::broadcast::{
    self,
    error::{RecvError, TryRecvError},
};

pub const LIBRARY_CHANGES_GATHERED_FOR: Duration = Duration::from_millis(250);

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
        self.drop_gathered_changes();
        Some(LibraryChanged)
    }

    fn drop_gathered_changes(&mut self) {
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

fn heard_synced(changed: &Result<Changed, RecvError>) -> Heard {
    match changed {
        Ok(
            Changed::TitleOrder
            | Changed::Registers {
                recounted: true, ..
            },
        )
        | Err(RecvError::Lagged(_)) => Heard::Change,
        Ok(Changed::Registers { keys, .. })
            if keys.iter().any(|key| {
                matches!(
                    key,
                    Key::Bookmark(_) | Key::Label(_) | Key::SeriesEdit(_) | Key::Removal(_)
                )
            }) =>
        {
            Heard::Change
        }
        Ok(Changed::Registers { .. }) => Heard::Unrelated,
        Err(RecvError::Closed) => Heard::Closed,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use omnileaf_db::store::RemovalKey;
    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
    use tokio::time::timeout;

    use super::*;

    #[tokio::test(start_paused = true)]
    async fn wakes_the_library_when_a_removal_arrives_from_another_device() {
        let (catalog, _) = broadcast::channel(1);
        let (synced, _) = broadcast::channel(1);
        let mut changes = LibraryChanges {
            catalog: catalog.subscribe(),
            synced: synced.subscribe(),
        };
        let page = ImageEntry { crc32: 1, size: 1 };
        let book = BookId::local(&Fingerprint::pmf1([page]).unwrap());
        synced
            .send(Changed::Registers {
                keys: BTreeSet::from([Key::from(RemovalKey::Removed(book))]),
                recounted: false,
            })
            .unwrap();

        let heard = timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next()).await;

        assert_eq!(heard, Ok(Some(LibraryChanged)));
    }
}
