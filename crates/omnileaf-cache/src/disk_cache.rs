use std::{
    fs::{self, DirEntry, File},
    io,
    path::{Path, PathBuf},
    process, slice,
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

    /// Misses an entry it can't read, or one a lost write left empty, and lets it go so it is made again; blocks on the file system.
    #[must_use]
    pub fn get(&self, key: &CacheKey) -> Option<Vec<u8>> {
        if !self.recency().touch(key) {
            return None;
        }
        let path = self.path_of(key);
        match fs::read(&path) {
            Ok(bytes) if bytes.is_empty() => {
                tracing::warn!(%key, "let go of a cache entry a lost write left empty");
                self.let_go(key);
                None
            }
            Ok(bytes) => {
                mark_used(&path, key);
                Some(bytes)
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                self.recency().forget(key);
                None
            }
            Err(error) => {
                tracing::warn!(%key, %error, "let go of a cache entry that can't be read");
                self.let_go(key);
                None
            }
        }
    }

    /// Stores nothing for an entry larger than the whole budget, and blocks on the file system.
    pub fn put(&self, key: &CacheKey, bytes: &[u8]) -> Result<(), CacheError> {
        let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
        if size > self.budget_bytes {
            tracing::debug!(%key, size, "leave out a cache entry larger than the whole budget");
            return Ok(());
        }
        if bytes.is_empty() {
            tracing::debug!(%key, "leave out an empty cache entry, which reads as a lost write");
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

    fn let_go(&self, key: &CacheKey) {
        self.recency().forget(key);
        self.remove_files(slice::from_ref(key));
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

/// Remembers the entry was just used through a handle of its own, so an entry it may only read is still served.
fn mark_used(path: &Path, key: &CacheKey) {
    let marked = File::options()
        .write(true)
        .open(path)
        .and_then(|file| file.set_modified(SystemTime::now()));
    if let Err(error) = marked {
        tracing::debug!(%key, %error, "remember when a cache entry was last used");
    }
}

fn remove_leftover(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        tracing::warn!(path = %path.display(), %error, "remove an unfinished cache write");
    }
}
