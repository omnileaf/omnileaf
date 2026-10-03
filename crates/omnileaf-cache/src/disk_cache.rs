use std::{
    fs::{self, DirEntry, File},
    io::{self, Read},
    path::{Path, PathBuf},
    process,
    sync::{
        Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
    time::SystemTime,
};

use crate::{CacheError, CacheKey, recency::Recency};

/// Marks a file still being written, which a key never contains, so one a crash left behind is never read as an entry.
const PARTIAL_MARKER: &str = ".partial-";
/// When an entry whose file has no readable modification time was last used, so it goes first.
const USED_LONG_AGO: SystemTime = SystemTime::UNIX_EPOCH;

/// Entries are files named by their key, and the file's modification time remembers when it was last used across restarts.
#[derive(Debug)]
pub struct DiskCache {
    folder: PathBuf,
    budget_bytes: u64,
    recency: Mutex<Recency>,
    next_write: AtomicU64,
}

impl DiskCache {
    /// Blocks while it lists the folder, creating it if missing, so call it off the async runtime.
    #[tracing::instrument(skip_all, fields(folder = %folder.display(), budget_bytes))]
    pub fn open(folder: PathBuf, budget_bytes: u64) -> Result<Self, CacheError> {
        let open_failed = |source| CacheError::Open {
            path: folder.clone(),
            source,
        };
        fs::create_dir_all(&folder).map_err(open_failed)?;
        let mut found: Vec<Found> = fs::read_dir(&folder)
            .map_err(open_failed)?
            .filter_map(found_entry)
            .collect();
        found.sort();
        let mut recency = Recency::default();
        for (_, key, bytes) in found {
            recency.record(key, bytes);
        }
        let evicted = recency.evict_beyond(budget_bytes);
        let cache = Self {
            folder,
            budget_bytes,
            recency: Mutex::new(recency),
            next_write: AtomicU64::new(0),
        };
        cache.remove_files(&evicted);
        Ok(cache)
    }

    /// Blocks on the file system.
    pub fn get(&self, key: &CacheKey) -> Result<Option<Vec<u8>>, CacheError> {
        if !self.recency().touch(key) {
            return Ok(None);
        }
        let read_failed = |source| CacheError::Read {
            key: key.clone(),
            source,
        };
        let mut file = match File::options()
            .read(true)
            .write(true)
            .open(self.path_of(key))
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                self.recency().forget(key);
                return Ok(None);
            }
            Err(error) => return Err(read_failed(error)),
        };
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(read_failed)?;
        if let Err(error) = file.set_modified(SystemTime::now()) {
            tracing::warn!(%key, %error, "remember when a cache entry was last used");
        }
        Ok(Some(bytes))
    }

    /// Stores nothing for an entry larger than the whole budget, and blocks on the file system.
    pub fn put(&self, key: &CacheKey, bytes: &[u8]) -> Result<(), CacheError> {
        let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
        if size > self.budget_bytes {
            tracing::debug!(%key, size, "leave out a cache entry larger than the whole budget");
            return Ok(());
        }
        let write_failed = |source| CacheError::Write {
            key: key.clone(),
            source,
        };
        let partial = self.partial_path_of(key);
        fs::write(&partial, bytes).map_err(write_failed)?;
        if let Err(error) = fs::rename(&partial, self.path_of(key)) {
            remove_leftover(&partial);
            return Err(write_failed(error));
        }
        let evicted = {
            let mut recency = self.recency();
            recency.record(key.clone(), size);
            recency.evict_beyond(self.budget_bytes)
        };
        self.remove_files(&evicted);
        Ok(())
    }

    #[must_use]
    pub fn stored_bytes(&self) -> u64 {
        self.recency().stored_bytes()
    }

    fn path_of(&self, key: &CacheKey) -> PathBuf {
        self.folder.join(key.as_file_name())
    }

    /// A name no other write uses, so two writers of one key never share a partial file.
    fn partial_path_of(&self, key: &CacheKey) -> PathBuf {
        let write = self.next_write.fetch_add(1, Ordering::Relaxed);
        self.folder
            .join(format!("{key}{PARTIAL_MARKER}{}-{write}", process::id()))
    }

    fn remove_files(&self, evicted: &[CacheKey]) {
        for key in evicted {
            match fs::remove_file(self.path_of(key)) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => tracing::warn!(%key, %error, "remove an evicted cache entry"),
            }
        }
    }

    fn recency(&self) -> MutexGuard<'_, Recency> {
        self.recency.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// When an entry was last used, its key and its size in bytes.
type Found = (SystemTime, CacheKey, u64);

/// Reads one listed file as an entry, leaving out anything else and any file that went or can't be read meanwhile.
fn found_entry(entry: io::Result<DirEntry>) -> Option<Found> {
    let entry = entry
        .inspect_err(|error| tracing::warn!(%error, "list a cache entry"))
        .ok()?;
    let name = entry.file_name();
    let name = name.to_str()?;
    if name.contains(PARTIAL_MARKER) {
        remove_leftover(&entry.path());
        return None;
    }
    let key = name.parse::<CacheKey>().ok()?;
    let metadata = match entry.metadata() {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            tracing::warn!(%key, %error, "leave out a cache entry whose details can't be read");
            return None;
        }
    };
    metadata.is_file().then(|| {
        let last_used = metadata.modified().unwrap_or(USED_LONG_AGO);
        (last_used, key, metadata.len())
    })
}

fn remove_leftover(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        tracing::warn!(path = %path.display(), %error, "remove an unfinished cache write");
    }
}
