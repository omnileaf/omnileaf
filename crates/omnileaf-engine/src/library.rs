use std::{fs, io, path::PathBuf, sync::Arc};

use omnileaf_db::{
    Config, Database,
    catalog::{
        NewRoot, PageRequest, PageSize, RootId, RootKind, RootLocator, add_root, library_root,
        library_roots, remove_root, set_home_root,
    },
    first_launch::{finish_first_launch, first_launch_finished},
    store::Clock,
};
use tokio::task::spawn_blocking;

use crate::{
    FolderCursor, FolderId, FolderPage, FolderScan, LibraryFolder, ScanProgress,
    scan::{Target, find_books_in, scan},
};

const DATABASE_FILE: &str = "library.sqlite";
const BACKUP_FOLDER: &str = "backups";
const FOLDERS_PER_PAGE: u16 = 50;
const MEBIBYTE: u32 = 1 << 20;
const MAPPED_DATABASE_BYTES: u32 = if cfg!(any(target_os = "android", target_os = "ios")) {
    64 * MEBIBYTE
} else {
    256 * MEBIBYTE
};

/// The library database in the home folder, and the folders it reads.
pub struct Library {
    database: Database,
    clock: Arc<dyn Clock>,
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
    #[error("run blocking library work")]
    Interrupted(#[from] tokio::task::JoinError),
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
            database,
            clock: Arc::new(clock),
        };
        library.set_home(home).await?;
        Ok(library)
    }

    /// Remembers the folder and scans its books, adding nothing when the folder can't be read.
    #[tracing::instrument(skip_all, fields(folder = %folder.display()))]
    pub async fn add_folder(
        &self,
        folder: PathBuf,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderScan, LibraryError> {
        on_progress(ScanProgress::Finding);
        let layout = find_books_in(folder.clone()).await?;
        let root = self.link(folder.clone()).await?;
        let target = self.target(root, folder);
        scan(&self.database, target, layout, on_progress).await
    }

    pub async fn folders(&self, after: Option<FolderCursor>) -> Result<FolderPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(FOLDERS_PER_PAGE)?,
        };
        let page = self
            .database
            .read(move |connection| library_roots(connection, &request))
            .await?;
        Ok(FolderPage {
            folders: page.items.into_iter().map(LibraryFolder::from).collect(),
            next: page.next.map(FolderCursor),
        })
    }

    /// Forgets the folder and the books found only in it, leaving its files where they are.
    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn remove_folder(&self, id: FolderId) -> Result<(), LibraryError> {
        Ok(self
            .database
            .write(move |transaction| remove_root(transaction, id.0))
            .await?)
    }

    /// Reads the folder's books into the catalog, calling `on_progress` as it goes.
    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn scan_folder(
        &self,
        id: FolderId,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderScan, LibraryError> {
        let root = self
            .database
            .read(move |connection| library_root(connection, id.0))
            .await?;
        let RootLocator::Path(folder) = root.locator;
        on_progress(ScanProgress::Finding);
        let layout = find_books_in(folder.clone()).await?;
        let target = self.target(root.id, folder);
        scan(&self.database, target, layout, on_progress).await
    }

    pub async fn first_launch_finished(&self) -> Result<bool, LibraryError> {
        Ok(self.database.read(first_launch_finished).await?)
    }

    /// Records the first launch as finished for good, so it never shows again on this device.
    #[tracing::instrument(skip_all)]
    pub async fn finish_first_launch(&self) -> Result<(), LibraryError> {
        let finished_at_ms = self.now_ms();
        Ok(self
            .database
            .write(move |transaction| finish_first_launch(transaction, finished_at_ms))
            .await?)
    }

    async fn set_home(&self, home: PathBuf) -> Result<(), LibraryError> {
        let locator = RootLocator::Path(home);
        let added_at_ms = self.now_ms();
        self.database
            .write(move |transaction| set_home_root(transaction, &locator, added_at_ms))
            .await?;
        Ok(())
    }

    async fn link(&self, folder: PathBuf) -> Result<RootId, LibraryError> {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(folder),
            added_at_ms: self.now_ms(),
        };
        Ok(self
            .database
            .write(move |transaction| add_root(transaction, &root))
            .await?)
    }

    fn target(&self, root: RootId, folder: PathBuf) -> Target {
        Target {
            root,
            folder,
            added_at_ms: self.now_ms(),
        }
    }

    fn now_ms(&self) -> i64 {
        i64::try_from(self.clock.now_unix_ms()).unwrap_or(i64::MAX)
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
