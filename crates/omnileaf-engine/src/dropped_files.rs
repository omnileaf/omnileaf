use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
};

use omnileaf_db::catalog::{RootKind, home_root};
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    BookId, FileToRead, FileType, FolderId, FolderScan, Library, LibraryError, OpenFileError,
    library_layout::folder_name,
    scan::{find_books_in, saturating_u32},
};

/// What a drop would hold, read from the dragged paths alone.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DropSummary {
    /// The name of the first file or folder the library can use.
    pub first: Option<String>,
    /// How many more files and folders the library can use.
    pub more: u32,
    /// The size of the comic files among those, folders counting for nothing.
    pub total_kilobytes: u32,
    pub refused: Vec<RefusedDrop>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RefusedDrop {
    pub name: String,
    pub reason: RefusalReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RefusalReason {
    NotAComic,
    TypeNotReadYet,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DropMode {
    /// Opens the first file or folder without adding it.
    ReadNow,
    /// Links the folder of each file, or the dropped folder, and leaves the files where they are.
    Add,
    /// Copies the files and folders into the home folder.
    Copy,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DropOutcome {
    #[serde(rename_all = "camelCase")]
    Reading {
        book: BookId,
        is_in_library: bool,
    },
    Added {
        folders: Vec<FolderScan>,
    },
    Copied {
        files: u32,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum DropError {
    #[error("use a drop that holds no comic file and no folder")]
    NothingToUse,
    #[error("copy {} into the home folder", path.display())]
    Copy {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("read a dropped file")]
    Open(#[from] OpenFileError),
    #[error("use a dropped folder")]
    Library(#[from] LibraryError),
}

const BYTES_PER_KILOBYTE: u64 = 1000;

enum Dropped {
    Comic { path: PathBuf, size_bytes: u64 },
    Folder(PathBuf),
    Refused(RefusedDrop),
}

fn classify(path: PathBuf) -> Dropped {
    let name = path
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    let Ok(details) = fs::metadata(&path) else {
        return Dropped::Refused(RefusedDrop {
            name,
            reason: RefusalReason::NotAComic,
        });
    };
    if details.is_dir() {
        return Dropped::Folder(path);
    }
    match FileType::of(&path) {
        Some(file_type) if file_type.is_read() => Dropped::Comic {
            path,
            size_bytes: details.len(),
        },
        Some(file_type) if file_type.is_book() => Dropped::Refused(RefusedDrop {
            name,
            reason: RefusalReason::TypeNotReadYet,
        }),
        Some(_) | None => Dropped::Refused(RefusedDrop {
            name,
            reason: RefusalReason::NotAComic,
        }),
    }
}

impl Library {
    pub async fn inspect_drop(&self, paths: Vec<PathBuf>) -> Result<DropSummary, LibraryError> {
        Ok(spawn_blocking(move || summarise(paths.into_iter().map(classify))).await?)
    }

    #[tracing::instrument(skip_all, fields(files = paths.len(), ?mode))]
    pub async fn drop_files(
        &self,
        paths: Vec<PathBuf>,
        mode: DropMode,
    ) -> Result<DropOutcome, DropError> {
        let usable: Vec<Dropped> = spawn_blocking(move || {
            paths
                .into_iter()
                .map(classify)
                .filter(|dropped| !matches!(dropped, Dropped::Refused(_)))
                .collect()
        })
        .await
        .map_err(LibraryError::from)?;
        if usable.is_empty() {
            return Err(DropError::NothingToUse);
        }
        match mode {
            DropMode::ReadNow => self.read_dropped(usable).await,
            DropMode::Add => self.add_dropped(usable).await,
            DropMode::Copy => self.copy_dropped(usable).await,
        }
    }

    async fn read_dropped(&self, usable: Vec<Dropped>) -> Result<DropOutcome, DropError> {
        let mut first_failure = None;
        for dropped in usable {
            let path = match dropped {
                Dropped::Comic { path, .. } => path,
                Dropped::Folder(folder) => match self.first_book_in(folder).await {
                    Ok(Some(path)) => path,
                    Ok(None) => continue,
                    Err(error) => {
                        first_failure.get_or_insert(DropError::Library(error));
                        continue;
                    }
                },
                Dropped::Refused(_) => continue,
            };
            match self.open_file(path).await {
                Ok(FileToRead {
                    book,
                    is_in_library,
                }) => {
                    return Ok(DropOutcome::Reading {
                        book,
                        is_in_library,
                    });
                }
                Err(error) => {
                    first_failure.get_or_insert(DropError::Open(error));
                }
            }
        }
        Err(first_failure.unwrap_or(DropError::NothingToUse))
    }

    async fn first_book_in(&self, folder: PathBuf) -> Result<Option<PathBuf>, LibraryError> {
        let layout = find_books_in(self.local_storage.clone(), folder, |_| {}).await?;
        Ok(layout.books.into_iter().map(|book| book.path).min())
    }

    async fn add_dropped(&self, usable: Vec<Dropped>) -> Result<DropOutcome, DropError> {
        let folders: BTreeSet<PathBuf> = usable
            .into_iter()
            .filter_map(|dropped| match dropped {
                Dropped::Comic { path, .. } => path.parent().map(Path::to_path_buf),
                Dropped::Folder(folder) => Some(folder),
                Dropped::Refused(_) => None,
            })
            .collect();
        let mut scans = Vec::with_capacity(folders.len());
        let mut first_failure = None;
        for folder in folders {
            match self.add_folder(folder, |_| {}).await {
                Ok(scan) => scans.push(scan),
                Err(error) => {
                    first_failure.get_or_insert(error);
                }
            }
        }
        match first_failure {
            Some(error) if scans.is_empty() => Err(error.into()),
            Some(_) | None => Ok(DropOutcome::Added { folders: scans }),
        }
    }

    async fn copy_dropped(&self, usable: Vec<Dropped>) -> Result<DropOutcome, DropError> {
        let (home, home_id) = self.home_folder_path().await?;
        let sources: Vec<PathBuf> = usable
            .into_iter()
            .filter_map(|dropped| match dropped {
                Dropped::Comic { path, .. } | Dropped::Folder(path) => Some(path),
                Dropped::Refused(_) => None,
            })
            .collect();
        let copying = home.clone();
        let copied = spawn_blocking(move || copy_all(&sources, &copying))
            .await
            .map_err(LibraryError::from)?;
        if let Err(error) = self.rescan_folder(home_id, |_| {}).await {
            tracing::warn!(error = %crate::describe_error(&error), "list the files copied into the home folder");
        }
        copied.map(|files| DropOutcome::Copied { files })
    }

    async fn home_folder_path(&self) -> Result<(PathBuf, FolderId), LibraryError> {
        let root = self
            .store
            .database()
            .read(
                |connection| Ok(home_root(connection)?.filter(|root| root.kind == RootKind::Home)),
            )
            .await?
            .ok_or_else(|| LibraryError::FolderUnreadable {
                path: PathBuf::new(),
                source: io::ErrorKind::NotFound.into(),
            })?;
        Ok((
            crate::library_folder::root_folder(&root.locator),
            FolderId(root.id),
        ))
    }
}

fn summarise(dropped: impl Iterator<Item = Dropped>) -> DropSummary {
    let mut usable = Vec::new();
    let mut refused = Vec::new();
    let mut total_bytes = 0_u64;
    for item in dropped {
        match item {
            Dropped::Comic { path, size_bytes } => {
                total_bytes = total_bytes.saturating_add(size_bytes);
                usable.push(path);
            }
            Dropped::Folder(path) => usable.push(path),
            Dropped::Refused(one) => refused.push(one),
        }
    }
    DropSummary {
        first: usable.first().map(|path| folder_name(path)),
        more: saturating_u32(usable.len().saturating_sub(1)),
        total_kilobytes: u32::try_from(total_bytes.div_ceil(BYTES_PER_KILOBYTE))
            .unwrap_or(u32::MAX),
        refused,
    }
}

fn copy_all(sources: &[PathBuf], home: &Path) -> Result<u32, DropError> {
    if !home.is_dir() {
        return Err(DropError::Library(LibraryError::FolderUnreadable {
            path: home.to_path_buf(),
            source: io::ErrorKind::NotFound.into(),
        }));
    }
    let home_now = home.canonicalize().map_err(|source| DropError::Copy {
        path: home.to_path_buf(),
        source,
    })?;
    let mut files = 0_u32;
    let mut copied_any = false;
    for source in sources {
        if source.file_name().is_none() || holds_home(source, &home_now) {
            continue;
        }
        files = files.saturating_add(copy_into(source, home)?);
        copied_any = true;
    }
    if copied_any {
        Ok(files)
    } else {
        Err(DropError::NothingToUse)
    }
}

fn holds_home(source: &Path, home: &Path) -> bool {
    source
        .canonicalize()
        .is_ok_and(|source| home.starts_with(source))
}

fn copy_into(source: &Path, folder: &Path) -> Result<u32, DropError> {
    let name = source.file_name().unwrap_or_default();
    let target = unused_name(folder, Path::new(name));
    if source.is_dir() {
        copy_folder(source, &target)
    } else {
        fs::copy(source, &target).map_err(|source_error| DropError::Copy {
            path: source.to_path_buf(),
            source: source_error,
        })?;
        Ok(1)
    }
}

fn copy_folder(source: &Path, target: &Path) -> Result<u32, DropError> {
    let copy_error = |path: &Path, source: io::Error| DropError::Copy {
        path: path.to_path_buf(),
        source,
    };
    fs::create_dir_all(target).map_err(|error| copy_error(target, error))?;
    let mut files = 0_u32;
    for entry in fs::read_dir(source).map_err(|error| copy_error(source, error))? {
        let entry = entry.map_err(|error| copy_error(source, error))?;
        let path = entry.path();
        let inside = target.join(entry.file_name());
        let kind = entry
            .file_type()
            .map_err(|error| copy_error(&path, error))?;
        if kind.is_dir() {
            files = files.saturating_add(copy_folder(&path, &inside)?);
        } else if kind.is_file() {
            fs::copy(&path, &inside).map_err(|error| copy_error(&path, error))?;
            files = files.saturating_add(1);
        }
    }
    Ok(files)
}

fn unused_name(folder: &Path, name: &Path) -> PathBuf {
    let first = folder.join(name);
    if !first.exists() {
        return first;
    }
    let stem = name
        .file_stem()
        .map_or_else(String::new, |stem| stem.to_string_lossy().into_owned());
    let extension = name
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    (2_u32..=u32::MAX)
        .map(|number| folder.join(format!("{stem} ({number}){extension}")))
        .find(|candidate| !candidate.exists())
        .unwrap_or(first)
}
