#![expect(
    clippy::unwrap_used,
    reason = "the scratch folder is test set-up, so a failure should stop the test"
)]

use std::{
    env, fs,
    ops::Deref,
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicUsize, Ordering},
};

use omnileaf_testkit::ArchiveEntry;

static CREATED: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct ScratchFolder(PathBuf);

impl ScratchFolder {
    /// Gives every call its own folder, so tests running as threads of one process never share one.
    pub(crate) fn new(name: &str) -> Self {
        let serial = CREATED.fetch_add(1, Ordering::Relaxed);
        let path = env::temp_dir()
            .join(format!("omnileaf-formats-{}", process::id()))
            .join(format!("{name}-{serial}"));
        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    pub(crate) fn write(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }
}

impl Deref for ScratchFolder {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn entry(name: &str, bytes: Vec<u8>) -> ArchiveEntry {
    ArchiveEntry {
        name: name.to_owned(),
        bytes,
    }
}
