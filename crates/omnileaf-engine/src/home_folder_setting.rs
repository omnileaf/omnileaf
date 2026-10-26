use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{FoundLibrary, LibraryError, found_library_in, library::DATABASE_FILE};

const SETTING_FILE: &str = "home-folder.json";
const UNSAVED_SETTING_FILE: &str = "home-folder.json.partial";

#[derive(Clone, Debug)]
pub struct HomeFolderSetting {
    data_folder: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HomeChoice {
    Current,
    Found { library: FoundLibrary },
    FoundFromANewerVersion,
    OverlapsHome,
    Empty,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Placement {
    Current,
    Overlapping,
    Apart,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum StoredHome {
    At { home: PathBuf },
}

#[derive(Debug, thiserror::Error)]
pub enum HomeFolderError {
    #[error("read the home folder setting {}", path.display())]
    Unreadable {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("read the home folder setting {} as one this build wrote", path.display())]
    Malformed {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("save the home folder setting {}", path.display())]
    Unsaved {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("store {} as the home folder, a path the setting can't hold", path.display())]
    Unstorable {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("open the home folder {}, which no longer holds its library", path.display())]
    LibraryMissing { path: PathBuf },
    #[error("use the library in {}, which holds none", path.display())]
    NoLibraryThere { path: PathBuf },
    #[error("read the folder chosen as the home folder")]
    Library(#[from] LibraryError),
    #[error("run blocking home folder work")]
    Interrupted(#[from] tokio::task::JoinError),
}

impl HomeFolderSetting {
    #[must_use]
    pub fn in_folder(data_folder: PathBuf) -> Self {
        Self { data_folder }
    }

    #[tracing::instrument(skip_all)]
    pub async fn home(&self) -> Result<PathBuf, HomeFolderError> {
        let setting = self.clone();
        spawn_blocking(move || setting.checked_home()).await?
    }

    #[tracing::instrument(skip_all, fields(chosen = %chosen.display()))]
    pub async fn choose(&self, chosen: &Path) -> Result<HomeChoice, HomeFolderError> {
        let placement = self.placement_of(chosen).await?;
        if placement == Placement::Current {
            return Ok(HomeChoice::Current);
        }
        match found_library_in(chosen).await {
            Ok(Some(library)) => Ok(HomeChoice::Found { library }),
            Ok(None) if placement == Placement::Overlapping => Ok(HomeChoice::OverlapsHome),
            Ok(None) => Ok(HomeChoice::Empty),
            Err(error) if error.was_written_by_a_newer_version() => {
                Ok(HomeChoice::FoundFromANewerVersion)
            }
            Err(error) => Err(error.into()),
        }
    }

    #[tracing::instrument(skip_all, fields(chosen = %chosen.display()))]
    pub async fn use_library_in(&self, chosen: &Path) -> Result<(), HomeFolderError> {
        if found_library_in(chosen).await?.is_none() {
            return Err(HomeFolderError::NoLibraryThere {
                path: chosen.to_path_buf(),
            });
        }
        let setting = self.clone();
        let stored = StoredHome::At {
            home: chosen.to_path_buf(),
        };
        spawn_blocking(move || setting.store(&stored)).await?
    }

    async fn placement_of(&self, chosen: &Path) -> Result<Placement, HomeFolderError> {
        let setting = self.clone();
        let chosen = chosen.to_path_buf();
        spawn_blocking(move || {
            let current = canonical(&setting.current_home()?);
            let chosen = canonical(&chosen);
            Ok(if chosen == current {
                Placement::Current
            } else if chosen.starts_with(&current) || current.starts_with(&chosen) {
                Placement::Overlapping
            } else {
                Placement::Apart
            })
        })
        .await?
    }

    fn checked_home(&self) -> Result<PathBuf, HomeFolderError> {
        match self.stored_home()? {
            None => Ok(self.data_folder.clone()),
            Some(home) if holds_a_library(&home)? => Ok(home),
            Some(home) => Err(HomeFolderError::LibraryMissing { path: home }),
        }
    }

    fn current_home(&self) -> Result<PathBuf, HomeFolderError> {
        Ok(self
            .stored_home()?
            .unwrap_or_else(|| self.data_folder.clone()))
    }

    fn stored_home(&self) -> Result<Option<PathBuf>, HomeFolderError> {
        let path = self.data_folder.join(SETTING_FILE);
        let text = match fs::read(&path) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(source) => return Err(HomeFolderError::Unreadable { path, source }),
        };
        let StoredHome::At { home } = serde_json::from_slice(&text)
            .map_err(|source| HomeFolderError::Malformed { path, source })?;
        Ok(Some(home))
    }

    fn store(&self, stored: &StoredHome) -> Result<(), HomeFolderError> {
        let text = serde_json::to_vec(stored).map_err(|source| HomeFolderError::Unstorable {
            path: stored.home().to_path_buf(),
            source,
        })?;
        let unsaved = self.data_folder.join(UNSAVED_SETTING_FILE);
        let saved = self.data_folder.join(SETTING_FILE);
        write_whole(&unsaved, &text)
            .and_then(|()| fs::rename(&unsaved, &saved))
            .map_err(|source| HomeFolderError::Unsaved {
                path: saved,
                source,
            })
    }
}

impl StoredHome {
    fn home(&self) -> &Path {
        match self {
            Self::At { home } => home,
        }
    }
}

fn holds_a_library(home: &Path) -> Result<bool, HomeFolderError> {
    home.join(DATABASE_FILE).try_exists().map_err(|source| {
        HomeFolderError::Library(LibraryError::FolderUnreadable {
            path: home.to_path_buf(),
            source,
        })
    })
}

fn write_whole(path: &Path, text: &[u8]) -> io::Result<()> {
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    let mut file = fs::File::create(path)?;
    file.write_all(text)?;
    file.sync_all()
}

/// Canonicalizing resolves links and, on Windows, gives a `\\?\` verbatim path, so a folder not made yet is compared through its nearest folder that exists.
fn canonical(folder: &Path) -> PathBuf {
    let mut not_made_yet = Vec::new();
    let mut existing = folder;
    loop {
        if let Ok(found) = fs::canonicalize(existing) {
            return not_made_yet
                .into_iter()
                .rev()
                .fold(found, |path, name| path.join(name));
        }
        let (Some(parent), Some(name)) = (existing.parent(), existing.file_name()) else {
            return folder.to_path_buf();
        };
        not_made_yet.push(name);
        existing = parent;
    }
}
