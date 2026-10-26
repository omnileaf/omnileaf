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
    Empty,
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
        let setting = self.clone();
        let current = spawn_blocking(move || setting.current_home()).await??;
        if is_same_folder(chosen, &current) {
            return Ok(HomeChoice::Current);
        }
        Ok(match found_library_in(chosen).await? {
            Some(library) => HomeChoice::Found { library },
            None => HomeChoice::Empty,
        })
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

fn is_same_folder(one: &Path, other: &Path) -> bool {
    one == other
        || matches!(
            (fs::canonicalize(one), fs::canonicalize(other)),
            (Ok(one), Ok(other)) if one == other
        )
}
