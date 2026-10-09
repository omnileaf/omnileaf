use std::{fs, io, path::PathBuf};

use omnileaf_db::{
    Config, Database,
    catalog::{
        AppleBookmark, Cover, NewRoot, PageRequest, PageSize, RootId, RootKind, RootLocator,
        SeriesOrder, add_root, bookmarked_roots, cover_file, library_root, library_roots,
        mark_root_available, mark_root_unavailable, remove_root, root_book_count, series_count,
        series_page, set_home_root,
    },
    first_launch::{finish_first_launch, first_launch_finished},
    library_view::{library_view, set_library_view},
    store::{Changed, Clock, Store},
};
use tokio::{
    sync::{Mutex, broadcast},
    task::spawn_blocking,
};

use crate::{
    AppLanguage, CoversPerRowOutOfRange, FolderCursor, FolderId, FolderPage, FolderRescan,
    FolderScan, LibraryChanges, LibraryFolder, LibrarySeries, LibraryView, RescanOutcome,
    ResolvedBookmark, ScanProgress, SeriesCursor, SeriesPage,
    bookmark_access::{AsRead, Reopened, note_bookmarks_opened},
    device_class::{IS_MOBILE, MEBIBYTE},
    library_changes::CatalogWritten,
    library_layout::folder_name,
    rescan::rescan,
    scan::{Target, find_books_in, scan, walk},
};

const DATABASE_FILE: &str = "library.sqlite";
const BACKUP_FOLDER: &str = "backups";
const FOLDERS_PER_PAGE: u16 = 50;
const SERIES_PER_PAGE: u16 = 50;
const CATALOG_WRITE_BACKLOG: usize = 16;
const MAPPED_DATABASE_BYTES: u32 = if IS_MOBILE {
    64 * MEBIBYTE
} else {
    256 * MEBIBYTE
};

/// The library database in the home folder, and the folders it reads.
pub struct Library {
    store: Store,
    /// Held for each scan and folder removal, so none compares a folder with a catalog another is changing.
    scanning: Mutex<()>,
    catalog_writes: broadcast::Sender<CatalogWritten>,
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("create the home folder {}", path.display())]
    CreateHome {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("read folder {}", path.display())]
    FolderUnreadable {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("library folder {id} isn't in the library")]
    FolderNotFound { id: FolderId },
    #[error("remove library folder {id}, the home folder the library always keeps")]
    HomeFolderKept { id: FolderId },
    #[error("reach the library database")]
    Database(#[source] omnileaf_db::Error),
    #[error("read the library view this device stored")]
    StoredView(#[source] CoversPerRowOutOfRange),
    #[error("run blocking library work")]
    Interrupted(#[from] tokio::task::JoinError),
}

impl LibraryError {
    /// True when a newer Omnileaf last wrote the library, which this build leaves alone rather than misread.
    #[must_use]
    pub fn was_written_by_a_newer_version(&self) -> bool {
        matches!(self, Self::Database(omnileaf_db::Error::NewerSchema { .. }))
    }
}

impl Library {
    /// Opens the library kept in `home`, creating the folder and its database on the first run.
    #[tracing::instrument(skip_all, fields(home = %home.display()))]
    pub async fn open(home: PathBuf, clock: impl Clock) -> Result<Self, LibraryError> {
        let config = Config {
            path: home.join(DATABASE_FILE),
            backup_dir: home.join(BACKUP_FOLDER),
            mmap_size_bytes: MAPPED_DATABASE_BYTES,
        };
        let created = home.clone();
        let database = spawn_blocking(move || {
            fs::create_dir_all(&created).map_err(|source| LibraryError::CreateHome {
                path: created,
                source,
            })?;
            Ok::<_, LibraryError>(Database::open(&config)?)
        })
        .await??;
        let library = Self {
            store: Store::new(database, clock),
            scanning: Mutex::new(()),
            catalog_writes: broadcast::Sender::new(CATALOG_WRITE_BACKLOG),
        };
        library.set_home(home).await?;
        Ok(library)
    }

    /// Remembers the folder and scans its books, adding nothing when the folder can't be read.
    #[tracing::instrument(skip_all, fields(folder))]
    pub async fn add_folder(
        &self,
        folder: impl Into<RootLocator>,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderScan, LibraryError> {
        let locator = folder.into();
        let folder = locator.path().to_path_buf();
        tracing::Span::current().record("folder", tracing::field::display(folder.display()));
        let _scanning = self.scanning.lock().await;
        on_progress(ScanProgress::Finding);
        let layout = find_books_in(folder.clone()).await?;
        let root = self.link(locator).await?;
        let target = self.target(root, RootKind::Linked, folder);
        scan(
            self.store.database(),
            target,
            layout,
            self.noting_writes(on_progress),
        )
        .await
    }

    pub async fn folders(&self, after: Option<FolderCursor>) -> Result<FolderPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(FOLDERS_PER_PAGE)?,
        };
        let page = self
            .store
            .database()
            .read(move |connection| library_roots(connection, &request))
            .await?;
        Ok(FolderPage {
            folders: page.items.into_iter().map(LibraryFolder::from).collect(),
            next: page.next.map(FolderCursor),
        })
    }

    /// Lists the series holding books, by title.
    pub async fn series(&self, after: Option<SeriesCursor>) -> Result<SeriesPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(SERIES_PER_PAGE)?,
        };
        let page = self
            .store
            .database()
            .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
            .await?;
        Ok(SeriesPage {
            series: page.items.into_iter().map(LibrarySeries::from).collect(),
            next: page.next.map(SeriesCursor),
        })
    }

    pub async fn folder_book_count(&self, id: FolderId) -> Result<u32, LibraryError> {
        Ok(self
            .store
            .database()
            .read(move |connection| root_book_count(connection, id.0))
            .await?)
    }

    pub async fn series_count(&self) -> Result<u32, LibraryError> {
        Ok(self.store.database().read(series_count).await?)
    }

    /// The view this device last set, or the one a new library starts with.
    pub async fn view(&self) -> Result<LibraryView, LibraryError> {
        let stored = self.store.database().read(library_view).await?;
        stored.map_or_else(
            || Ok(LibraryView::default()),
            |view| LibraryView::try_from(view).map_err(LibraryError::StoredView),
        )
    }

    #[tracing::instrument(skip_all)]
    pub async fn set_view(&self, view: LibraryView) -> Result<(), LibraryError> {
        let stored = view.into();
        Ok(self
            .store
            .database()
            .write(move |transaction| set_library_view(transaction, &stored))
            .await?)
    }

    /// Where the cover's file is, or nothing once it has changed or gone since the cover was listed.
    pub(crate) async fn cover_file(&self, cover: Cover) -> Result<Option<PathBuf>, LibraryError> {
        Ok(self
            .store
            .database()
            .read(move |connection| cover_file(connection, &cover))
            .await?)
    }

    /// Forgets the folder and the books found only in it, leaving its files where they are, once any scan in progress ends.
    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn remove_folder(&self, id: FolderId) -> Result<(), LibraryError> {
        let _scanning = self.scanning.lock().await;
        self.store
            .database()
            .write(move |transaction| remove_root(transaction, id.0))
            .await?;
        self.note_catalog_written();
        Ok(())
    }

    /// Brings the catalog in line with the folder's files, removing nothing when the folder can't be read or looks unplugged.
    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn rescan_folder(
        &self,
        id: FolderId,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderRescan, LibraryError> {
        let _scanning = self.scanning.lock().await;
        let root = self
            .store
            .database()
            .read(move |connection| library_root(connection, id.0))
            .await?;
        let folder = root.locator.into_path();
        on_progress(ScanProgress::Finding);
        let outcome = match walk(folder.clone()).await? {
            Ok(layout) => {
                let target = self.target(root.id, root.kind, folder.clone());
                let outcome =
                    rescan(&self.store, target, layout, self.noting_writes(on_progress)).await?;
                if let RescanOutcome::Rescanned(changes) = &outcome
                    && changes.removed > 0
                {
                    self.note_catalog_written();
                }
                outcome
            }
            Err(error) => {
                tracing::warn!(%error, "keep the books of a folder the rescan can't read");
                RescanOutcome::Unreachable
            }
        };
        self.note_availability(root.id, root.unavailable_since_ms, &outcome)
            .await?;
        Ok(FolderRescan {
            id,
            name: folder_name(&folder),
            outcome,
        })
    }

    /// Opens each linked folder kept by a bookmark through `resolve`, which may block, following the ones that moved and returning those whose bookmark wouldn't open.
    #[tracing::instrument(skip_all)]
    pub async fn restore_folder_access<E: Send + 'static>(
        &self,
        mut resolve: impl FnMut(&AppleBookmark) -> Result<ResolvedBookmark, E> + Send + 'static,
    ) -> Result<Vec<(FolderId, E)>, LibraryError> {
        let bookmarked = self.store.database().read(bookmarked_roots).await?;
        if bookmarked.is_empty() {
            return Ok(Vec::new());
        }
        let resolved = spawn_blocking(move || {
            bookmarked
                .into_iter()
                .map(|root| {
                    let outcome = resolve(&root.bookmark);
                    (root, outcome)
                })
                .collect::<Vec<_>>()
        })
        .await?;
        let mut unopened = Vec::new();
        let mut unreachable = Vec::new();
        let mut reopened = Vec::new();
        for (root, outcome) in resolved {
            match outcome {
                Ok(resolved) => reopened.push(Reopened::of(root, resolved)),
                Err(error) => {
                    unreachable.push(AsRead::of(&root));
                    unopened.push((FolderId(root.id), error));
                }
            }
        }
        self.note_reopened(unreachable, reopened).await?;
        Ok(unopened)
    }

    async fn note_reopened(
        &self,
        unreachable: Vec<AsRead>,
        reopened: Vec<Reopened>,
    ) -> Result<(), LibraryError> {
        let since_ms = self.now_ms();
        let _scanning = self.scanning.lock().await;
        let changed = self
            .store
            .database()
            .write(move |transaction| {
                note_bookmarks_opened(transaction, &unreachable, &reopened, since_ms)
            })
            .await?;
        if changed {
            self.note_catalog_written();
        }
        Ok(())
    }

    /// Rescans the home folder and every linked folder in turn, in the order they were added, leaving out a folder removed meanwhile.
    #[tracing::instrument(skip_all)]
    pub async fn rescan_folders(&self) -> Result<Vec<FolderRescan>, LibraryError> {
        let mut rescans = Vec::new();
        let mut after = None;
        loop {
            let page = self.folders(after).await?;
            for folder in page.folders {
                match self.rescan_folder(folder.id, |_| {}).await {
                    Ok(rescan) => rescans.push(rescan),
                    Err(LibraryError::FolderNotFound { id }) => {
                        tracing::debug!(folder = %id, "skip a folder removed since the rescan listed it");
                    }
                    Err(error) => return Err(error),
                }
            }
            match page.next {
                Some(next) => after = Some(next),
                None => return Ok(rescans),
            }
        }
    }

    /// Sorts the library's titles for the app's language, keying them again only when it isn't the one they sort by.
    #[tracing::instrument(skip_all, fields(%language))]
    pub async fn set_language(&self, language: AppLanguage) -> Result<(), LibraryError> {
        Ok(self.store.sort_titles_for(language.0).await?)
    }

    /// A receiver that falls too far behind loses the oldest changes and is told how many it missed.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<Changed> {
        self.store.subscribe()
    }

    #[must_use]
    pub fn changes(&self) -> LibraryChanges {
        LibraryChanges {
            catalog: self.catalog_writes.subscribe(),
            synced: self.store.subscribe(),
        }
    }

    pub async fn first_launch_finished(&self) -> Result<bool, LibraryError> {
        Ok(self.store.database().read(first_launch_finished).await?)
    }

    /// Records the first launch as finished for good, so it never shows again on this device.
    #[tracing::instrument(skip_all)]
    pub async fn finish_first_launch(&self) -> Result<(), LibraryError> {
        let finished_at_ms = self.now_ms();
        Ok(self
            .store
            .database()
            .write(move |transaction| finish_first_launch(transaction, finished_at_ms))
            .await?)
    }

    async fn set_home(&self, home: PathBuf) -> Result<(), LibraryError> {
        let locator = RootLocator::Path(home);
        let added_at_ms = self.now_ms();
        self.store
            .database()
            .write(move |transaction| set_home_root(transaction, &locator, added_at_ms))
            .await?;
        Ok(())
    }

    /// Reads a folder linked before as available again, since it was just read.
    async fn link(&self, locator: RootLocator) -> Result<RootId, LibraryError> {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator,
            added_at_ms: self.now_ms(),
        };
        Ok(self
            .store
            .database()
            .write(move |transaction| {
                let id = add_root(transaction, &root)?;
                mark_root_available(transaction, id)?;
                Ok(id)
            })
            .await?)
    }

    /// Writes only when the folder's availability changed, so an unchanged rescan stays a read.
    async fn note_availability(
        &self,
        root: RootId,
        unavailable_since_ms: Option<i64>,
        outcome: &RescanOutcome,
    ) -> Result<(), LibraryError> {
        let database = self.store.database();
        match (outcome, unavailable_since_ms) {
            (RescanOutcome::Rescanned(_), None)
            | (RescanOutcome::Unreachable | RescanOutcome::FoundEmpty, Some(_)) => {}
            (RescanOutcome::Rescanned(_), Some(_)) => {
                database
                    .write(move |transaction| mark_root_available(transaction, root))
                    .await?;
            }
            (RescanOutcome::Unreachable | RescanOutcome::FoundEmpty, None) => {
                let since_ms = self.now_ms();
                database
                    .write(move |transaction| mark_root_unavailable(transaction, root, since_ms))
                    .await?;
            }
        }
        Ok(())
    }

    /// Scans report their progress after recording each batch, so a report of books read is a catalog written.
    fn noting_writes<'a>(
        &'a self,
        mut on_progress: impl FnMut(ScanProgress) + Send + 'a,
    ) -> impl FnMut(ScanProgress) + Send + 'a {
        move |progress| {
            if matches!(progress, ScanProgress::Reading { scanned, .. } if scanned > 0) {
                self.note_catalog_written();
            }
            on_progress(progress);
        }
    }

    fn note_catalog_written(&self) {
        if self.catalog_writes.send(CatalogWritten).is_err() {
            tracing::trace!("no one is listening for library changes");
        }
    }

    fn target(&self, root: RootId, kind: RootKind, folder: PathBuf) -> Target {
        Target {
            root,
            kind,
            folder,
            added_at_ms: self.now_ms(),
        }
    }

    fn now_ms(&self) -> i64 {
        i64::try_from(self.store.clock().now_unix_ms()).unwrap_or(i64::MAX)
    }
}

impl From<omnileaf_db::Error> for LibraryError {
    fn from(error: omnileaf_db::Error) -> Self {
        match error {
            omnileaf_db::Error::UnknownRoot { id } => Self::FolderNotFound { id: FolderId(id) },
            omnileaf_db::Error::HomeRoot { id } => Self::HomeFolderKept { id: FolderId(id) },
            other => Self::Database(other),
        }
    }
}
