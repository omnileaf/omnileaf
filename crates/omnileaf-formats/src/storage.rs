use std::{
    ffi::OsString,
    fmt,
    fs::{self, File},
    io,
    path::Path,
    time::SystemTime,
};

/// Where books are read from, so the readers and the fingerprint never reach a file any other way.
pub trait Storage: fmt::Debug + Send + Sync {
    /// What is directly inside `folder`, without following links.
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>>;
    /// Whether `path` is a folder or a file, following links.
    fn details(&self, path: &Path) -> io::Result<Details>;
    fn open(&self, file: &Path) -> io::Result<File>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub name: OsString,
    pub kind: EntryKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntryKind {
    Folder,
    File { size: u64 },
    Other,
    Unreadable(io::ErrorKind),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Details {
    Folder {
        modified: Option<SystemTime>,
    },
    File {
        size: u64,
        modified: Option<SystemTime>,
    },
}

/// The device's own file system.
#[derive(Clone, Copy, Debug)]
pub struct LocalStorage;

impl Storage for LocalStorage {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        fs::read_dir(folder)?
            .map(|entry| {
                let entry = entry?;
                Ok(Entry {
                    name: entry.file_name(),
                    kind: EntryKind::of(&entry),
                })
            })
            .collect()
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        let metadata = fs::metadata(path)?;
        let modified = metadata.modified().ok();
        Ok(if metadata.is_dir() {
            Details::Folder { modified }
        } else {
            Details::File {
                size: metadata.len(),
                modified,
            }
        })
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        File::open(file)
    }
}

impl EntryKind {
    fn of(entry: &fs::DirEntry) -> Self {
        match entry.file_type() {
            Err(error) => Self::Unreadable(error.kind()),
            Ok(kind) if kind.is_dir() => Self::Folder,
            Ok(kind) if kind.is_file() => match entry.metadata() {
                Ok(metadata) => Self::File {
                    size: metadata.len(),
                },
                Err(error) => Self::Unreadable(error.kind()),
            },
            Ok(_) => Self::Other,
        }
    }
}
