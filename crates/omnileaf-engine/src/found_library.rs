use std::{
    fs, io,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use omnileaf_db::library_contents::library_contents;
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    LibraryError,
    library::{BACKUP_FOLDER, DATABASE_FILE},
};

const BACKUP_EXTENSION: &str = "sqlite";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FoundLibrary {
    pub series: u32,
    pub books: u32,
    /// Crosses as a plain number, which holds every such date exactly.
    #[specta(type = Option<i32>)]
    pub last_backup_at_ms: Option<i64>,
}

#[tracing::instrument(skip_all, fields(folder = %folder.display()))]
pub async fn found_library_in(folder: &Path) -> Result<Option<FoundLibrary>, LibraryError> {
    let folder = folder.to_path_buf();
    spawn_blocking(move || find_library(&folder)).await?
}

fn find_library(folder: &Path) -> Result<Option<FoundLibrary>, LibraryError> {
    let database = folder.join(DATABASE_FILE);
    if !database.try_exists().map_err(unreadable(folder))? {
        return Ok(None);
    }
    let contents = library_contents(&database)?;
    Ok(Some(FoundLibrary {
        series: saturating_u32(contents.series),
        books: saturating_u32(contents.books),
        last_backup_at_ms: last_backup_at_ms(&folder.join(BACKUP_FOLDER))?,
    }))
}

fn last_backup_at_ms(backups: &Path) -> Result<Option<i64>, LibraryError> {
    let entries = match fs::read_dir(backups) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(unreadable(backups)(error)),
    };
    let mut newest = None;
    for entry in entries {
        let entry = entry.map_err(unreadable(backups))?;
        if is_finished_backup(&entry.path()) {
            let made_at = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .map_err(unreadable(backups))?;
            newest = newest.max(unix_ms(made_at));
        }
    }
    Ok(newest)
}

pub(crate) fn is_finished_backup(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .is_some_and(|extension| extension == BACKUP_EXTENSION)
}

fn unix_ms(time: SystemTime) -> Option<i64> {
    let since_epoch = time.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(since_epoch.as_millis()).ok()
}

fn saturating_u32(count: u64) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

fn unreadable(path: &Path) -> impl Fn(io::Error) -> LibraryError {
    let path = path.to_path_buf();
    move |source| LibraryError::FolderUnreadable {
        path: path.clone(),
        source,
    }
}
