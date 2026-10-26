use std::{fs, io, path::Path};

use omnileaf_db::library_copy::{copy_library, is_copy_of};

use crate::{HomeFolderError, LibraryError, library::DATABASE_FILE};

const UNFINISHED_COPY: &str = "library.sqlite.partial";

pub(crate) fn prepare_move(to: &Path) -> Result<(), HomeFolderError> {
    fs::create_dir_all(to)
        .and_then(|()| fs::File::create(to.join(UNFINISHED_COPY)))
        .map(drop)
        .map_err(unmoved(to))
}

#[tracing::instrument(skip_all, fields(from = %from.display(), to = %to.display()))]
pub(crate) fn finish_move(from: &Path, to: &Path) -> Result<(), HomeFolderError> {
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
    copy_library(&original, &unfinished).map_err(LibraryError::from)?;
    if placed.try_exists().map_err(unmoved(to))? {
        remove_if_present(&unfinished).map_err(unmoved(to))?;
        return Err(library_there(to));
    }
    fs::rename(&unfinished, &placed).map_err(unmoved(to))
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
