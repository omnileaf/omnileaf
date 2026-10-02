use std::{fs, io, path::Path};

use rusqlite::Connection;

use crate::Error;

/// Copies the database into the backup folder, replacing an earlier copy of the same schema version only once the new one is complete.
pub(crate) fn back_up(
    connection: &Connection,
    backup_dir: &Path,
    schema_version: u32,
) -> Result<(), Error> {
    let target = backup_dir.join(format!("schema-v{schema_version}.sqlite"));
    let partial = target.with_extension("sqlite.partial");
    let partial_text = partial
        .to_str()
        .ok_or_else(|| Error::BackupPathNotUnicode {
            path: partial.clone(),
        })?;
    fs::create_dir_all(backup_dir)
        .and_then(|()| remove_if_present(&partial))
        .map_err(|source| backup_file_failed(&partial, source))?;
    connection
        .execute("VACUUM INTO ?1", [partial_text])
        .map_err(|source| Error::Backup {
            path: partial.clone(),
            source,
        })?;
    fs::rename(&partial, &target).map_err(|source| backup_file_failed(&target, source))?;
    tracing::info!(path = %target.display(), "backed up the database before migrating it");
    Ok(())
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        outcome => outcome,
    }
}

fn backup_file_failed(path: &Path, source: io::Error) -> Error {
    Error::BackupFile {
        path: path.to_owned(),
        source,
    }
}
