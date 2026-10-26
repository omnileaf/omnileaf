use std::{
    ffi::OsString,
    fs,
    io::{self, BufRead, BufReader},
    path::{Path, PathBuf},
};

use omnileaf_db::library_copy::{copy_library, is_copy_of};

use crate::{
    HomeFolderError, LibraryError,
    found_library::is_finished_backup,
    library::{BACKUP_FOLDER, DATABASE_FILE},
};

const UNFINISHED_COPY: &str = "library.sqlite.partial";
const UNFINISHED_BACKUP_EXTENSION: &str = "sqlite.partial";
const SET_ASIDE_STEM: &str = "library-moved";
const SIDECARS_THEN_DATABASE: [&str; 3] = ["-wal", "-shm", ""];

pub(crate) fn prepare_move(to: &Path) -> Result<(), HomeFolderError> {
    fs::create_dir_all(to)
        .and_then(|()| fs::File::create(to.join(UNFINISHED_COPY)))
        .map(drop)
        .map_err(unmoved(to))
}

#[tracing::instrument(skip_all, fields(from = %from.display(), to = %to.display()))]
pub(crate) fn finish_move(from: &Path, to: &Path) -> Result<(), HomeFolderError> {
    place_copy(from, to)?;
    sync_folder(to).map_err(unmoved(to))
}

fn place_copy(from: &Path, to: &Path) -> Result<(), HomeFolderError> {
    let original = from.join(DATABASE_FILE);
    let placed = to.join(DATABASE_FILE);
    let unfinished = to.join(UNFINISHED_COPY);
    if placed.try_exists().map_err(unmoved(to))? {
        let is_this_library = is_copy_of(&placed, &original).map_err(LibraryError::from)?;
        remove_if_present(&unfinished).map_err(unmoved(to))?;
        return if is_this_library {
            Ok(())
        } else {
            Err(library_there(to))
        };
    }
    remove_if_present(&unfinished).map_err(unmoved(to))?;
    copy_backups(from, to).map_err(unmoved(to))?;
    copy_library(&original, &unfinished).map_err(LibraryError::from)?;
    if placed.try_exists().map_err(unmoved(to))? {
        remove_if_present(&unfinished).map_err(unmoved(to))?;
        return Err(library_there(to));
    }
    fs::rename(&unfinished, &placed).map_err(unmoved(to))
}

fn copy_backups(from: &Path, to: &Path) -> io::Result<()> {
    let entries = match fs::read_dir(from.join(BACKUP_FOLDER)) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        entries => entries?,
    };
    let copies = to.join(BACKUP_FOLDER);
    for entry in entries {
        let entry = entry?;
        let backup = entry.path();
        let copy = copies.join(entry.file_name());
        if is_finished_backup(&backup) && !is_already_copied(&backup, &copy)? {
            fs::create_dir_all(&copies)?;
            copy_backup(&backup, &copy)?;
        }
    }
    match sync_folder(&copies) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        outcome => outcome,
    }
}

fn is_already_copied(backup: &Path, copy: &Path) -> io::Result<bool> {
    if !copy.try_exists()? {
        return Ok(false);
    }
    if holds_the_same_bytes(backup, copy)? {
        Ok(true)
    } else {
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("{} holds another backup by that name", copy.display()),
        ))
    }
}

fn holds_the_same_bytes(original: &Path, copy: &Path) -> io::Result<bool> {
    let mut original = BufReader::new(fs::File::open(original)?);
    let mut copy = BufReader::new(fs::File::open(copy)?);
    loop {
        let original_bytes = original.fill_buf()?;
        let copy_bytes = copy.fill_buf()?;
        let compared = original_bytes.len().min(copy_bytes.len());
        if compared == 0 {
            return Ok(original_bytes.is_empty() && copy_bytes.is_empty());
        }
        if original_bytes.get(..compared) != copy_bytes.get(..compared) {
            return Ok(false);
        }
        original.consume(compared);
        copy.consume(compared);
    }
}

fn copy_backup(backup: &Path, copy: &Path) -> io::Result<()> {
    let unfinished = copy.with_extension(UNFINISHED_BACKUP_EXTENSION);
    let mut original = fs::File::open(backup)?;
    let mut written = fs::File::create(&unfinished)?;
    io::copy(&mut original, &mut written)?;
    written.set_modified(original.metadata()?.modified()?)?;
    written.sync_all()?;
    fs::rename(&unfinished, copy)
}

#[tracing::instrument(skip_all, fields(folder = %folder.display()))]
pub(crate) fn set_aside_library_in(folder: &Path) -> io::Result<()> {
    let database = folder.join(DATABASE_FILE);
    let set_aside = unused_set_aside_path(folder)?;
    for suffix in SIDECARS_THEN_DATABASE {
        rename_if_present(&suffixed(&database, suffix), &suffixed(&set_aside, suffix))?;
    }
    sync_folder(folder)
}

fn unused_set_aside_path(folder: &Path) -> io::Result<PathBuf> {
    for number in 1..=u32::MAX {
        let path = folder.join(set_aside_name(number));
        if !path.try_exists()? {
            return Ok(path);
        }
    }
    Err(io::ErrorKind::AlreadyExists.into())
}

fn set_aside_name(number: u32) -> String {
    match number {
        1 => format!("{SET_ASIDE_STEM}.sqlite"),
        _ => format!("{SET_ASIDE_STEM}-{number}.sqlite"),
    }
}

/// POSIX makes a rename durable only once the folder holding it is synced, and Windows opens a folder only with `FILE_FLAG_BACKUP_SEMANTICS`, which a plain `File::open` doesn't pass.
pub(crate) fn sync_folder(folder: &Path) -> io::Result<()> {
    if cfg!(unix) {
        fs::File::open(folder)?.sync_all()?;
    }
    Ok(())
}

fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(path);
    name.push(suffix);
    PathBuf::from(name)
}

fn rename_if_present(path: &Path, to: &Path) -> io::Result<()> {
    match fs::rename(path, to) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        outcome => outcome,
    }
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        outcome => outcome,
    }
}

fn library_there(to: &Path) -> HomeFolderError {
    HomeFolderError::LibraryThere {
        path: to.to_path_buf(),
    }
}

fn unmoved(to: &Path) -> impl Fn(io::Error) -> HomeFolderError {
    let to = to.to_path_buf();
    move |source| HomeFolderError::Unmoved {
        path: to.clone(),
        source,
    }
}
