use std::{
    fs::{self, DirEntry, File},
    io,
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
        let mut found: Vec<FoundEntry> = fs::read_dir(&folder)
            .map_err(open_failed)?
            .filter_map(found_entry)
            .collect();
        found.sort_by(|one, other| {
            one.last_used
                .cmp(&other.last_used)
                .then_with(|| one.key.cmp(&other.key))
        });
        let mut recency = Recency::default();
        for entry in found {
            recency.record(entry.key, entry.size_bytes);
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

    /// Misses an entry it can't read now, letting go of a damaged one or one a lost write left empty so it is made again; blocks on the file system.
    #[must_use]
    pub fn get(&self, key: &CacheKey) -> Option<Vec<u8>> {
        if !self.recency().touch(key) {
            return None;
        }
        let path = self.path_of(key);
        match fs::read(&path) {
            Ok(bytes) if bytes.is_empty() => {
                tracing::warn!(%key, "let go of a cache entry a lost write left empty");
                self.remove(key);
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
            Err(error) if means_damaged(&error) => {
                tracing::warn!(%key, %error, "let go of a cache entry that can't be read");
                self.remove(key);
                None
            }
            Err(error) => {
                tracing::warn!(%key, %error, "read a cache entry, which stays for the next request");
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

    /// Lets go of an entry its reader found damaged, still counting one whose file stays, and blocks on the file system.
    pub fn remove(&self, key: &CacheKey) {
        let mut recency = self.recency();
        if self.remove_file(key) {
            recency.forget(key);
        }
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
            self.remove_file(key);
        }
    }

    /// Whether the entry's file is gone, removed now or before.
    fn remove_file(&self, key: &CacheKey) -> bool {
        match fs::remove_file(self.path_of(key)) {
            Ok(()) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => true,
            Err(error) => {
                tracing::warn!(%key, %error, "remove a cache entry");
                false
            }
        }
    }

    fn recency(&self) -> MutexGuard<'_, Recency> {
        self.recency.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

struct FoundEntry {
    last_used: SystemTime,
    key: CacheKey,
    size_bytes: u64,
}

/// Reads one listed file as an entry, leaving out anything else and any file that went or can't be read meanwhile.
fn found_entry(entry: io::Result<DirEntry>) -> Option<FoundEntry> {
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
    metadata.is_file().then(|| FoundEntry {
        last_used: metadata.modified().unwrap_or(USED_LONG_AGO),
        key,
        size_bytes: metadata.len(),
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

/// A read error every later read of the entry would meet too, unlike a passing one such as a busy file.
fn means_damaged(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::PermissionDenied | io::ErrorKind::InvalidData
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_busy_entry_as_passing_not_as_damaged() {
        let error = io::Error::from(io::ErrorKind::ResourceBusy);

        let damaged = means_damaged(&error);

        assert!(!damaged);
    }

    #[test]
    fn reads_an_entry_it_has_no_permission_to_read_as_damaged() {
        let error = io::Error::from(io::ErrorKind::PermissionDenied);

        let damaged = means_damaged(&error);

        assert!(damaged);
    }
}
