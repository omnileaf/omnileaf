use std::{
    collections::BTreeSet,
    mem,
    sync::{Mutex, MutexGuard, PoisonError},
};

use notify::Event;
use tokio::sync::Notify;

use super::roots::Roots;
use crate::FolderId;

/// What the system's watch reported since it was last taken, holding each folder once however many events named it.
#[derive(Debug, Default)]
pub(super) struct Heard {
    folders: Mutex<HeardFolders>,
    wake: Notify,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct HeardFolders {
    pub(super) changed: BTreeSet<FolderId>,
    /// Folders whose watch may have missed changes or stopped, to be watched again.
    pub(super) broken: BTreeSet<FolderId>,
}

impl Heard {
    /// Runs on the thread the system's watch reports on, so it only notes the folders and wakes whoever waits.
    pub(super) fn take_in(&self, roots: &Roots, event: notify::Result<Event>) {
        match event {
            Ok(event) if event.need_rescan() => self.broken(roots.enclosing(&event.paths)),
            Ok(event) => self.changed(roots.concerned(&event)),
            Err(error) => {
                tracing::warn!(%error, "hear of changes in the library folders, watching them again");
                self.broken(roots.enclosing(&error.paths));
            }
        }
    }

    pub(super) fn take(&self) -> HeardFolders {
        mem::take(&mut *self.folders())
    }

    pub(super) async fn told(&self) {
        self.wake.notified().await;
    }

    fn changed(&self, folders: BTreeSet<FolderId>) {
        if folders.is_empty() {
            return;
        }
        self.folders().changed.extend(folders);
        self.wake.notify_one();
    }

    fn broken(&self, folders: BTreeSet<FolderId>) {
        if folders.is_empty() {
            return;
        }
        let mut heard = self.folders();
        heard.changed.extend(&folders);
        heard.broken.extend(folders);
        drop(heard);
        self.wake.notify_one();
    }

    fn folders(&self) -> MutexGuard<'_, HeardFolders> {
        self.folders.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, time::Duration};

    use notify::{
        EventKind,
        event::{CreateKind, Flag},
    };
    use tokio::time::timeout;

    use super::*;
    use crate::{LibraryFolders, folder_watch::AppFiles};

    fn folder(id: &str) -> FolderId {
        id.parse().unwrap()
    }

    fn roots() -> Roots {
        let roots = Roots::new(&AppFiles {
            library: LibraryFolders::from(PathBuf::from("/data")),
            folders: Vec::new(),
        });
        roots.insert(folder("1"), &PathBuf::from("/books"));
        roots.insert(folder("2"), &PathBuf::from("/comics"));
        roots
    }

    fn added(path: &str) -> Event {
        Event::new(EventKind::Create(CreateKind::File)).add_path(PathBuf::from(path))
    }

    #[test]
    fn holds_a_folder_once_however_many_events_name_it() {
        let heard = Heard::default();
        let roots = roots();

        for book in 0..1000 {
            heard.take_in(&roots, Ok(added(&format!("/books/Sample/v{book}.cbz"))));
        }

        assert_eq!(
            heard.take(),
            HeardFolders {
                changed: BTreeSet::from([folder("1")]),
                broken: BTreeSet::new(),
            }
        );
        assert_eq!(heard.take(), HeardFolders::default());
    }

    #[test]
    fn takes_in_an_error_as_a_change_and_a_broken_watch_of_the_folder_it_names() {
        let heard = Heard::default();

        heard.take_in(
            &roots(),
            Err(notify::Error::generic("too many watches")
                .add_path(PathBuf::from("/comics/Sample"))),
        );

        assert_eq!(
            heard.take(),
            HeardFolders {
                changed: BTreeSet::from([folder("2")]),
                broken: BTreeSet::from([folder("2")]),
            }
        );
    }

    #[test]
    fn takes_in_an_error_naming_no_path_as_a_broken_watch_of_every_folder() {
        let heard = Heard::default();

        heard.take_in(&roots(), Err(notify::Error::generic("read the watch")));

        let every = BTreeSet::from([folder("1"), folder("2")]);
        assert_eq!(
            heard.take(),
            HeardFolders {
                changed: every.clone(),
                broken: every,
            }
        );
    }

    #[test]
    fn takes_in_dropped_events_as_a_change_and_a_broken_watch() {
        let heard = Heard::default();

        heard.take_in(
            &roots(),
            Ok(Event::new(EventKind::Other).set_flag(Flag::Rescan)),
        );

        let every = BTreeSet::from([folder("1"), folder("2")]);
        assert_eq!(
            heard.take(),
            HeardFolders {
                changed: every.clone(),
                broken: every,
            }
        );
    }

    #[tokio::test]
    async fn wakes_whoever_waits_once_a_change_is_heard() {
        let heard = Heard::default();

        heard.take_in(&roots(), Ok(added("/books/v01.cbz")));

        assert!(timeout(Duration::from_secs(1), heard.told()).await.is_ok());
    }

    #[tokio::test]
    async fn stays_asleep_while_nothing_concerning_books_is_heard() {
        let heard = Heard::default();

        heard.take_in(&roots(), Ok(added("/elsewhere/v01.cbz")));

        assert!(
            timeout(Duration::from_millis(50), heard.told())
                .await
                .is_err()
        );
    }
}
