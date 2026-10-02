#![expect(
    clippy::unwrap_used,
    reason = "the scratch folder is test set-up, so a failure should stop the test"
)]

use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::atomic::{AtomicUsize, Ordering},
};

use omnileaf_db::Config;

static CREATED: AtomicUsize = AtomicUsize::new(0);

pub(crate) const MMAP_SIZE_BYTES: u32 = 1 << 20;

pub(crate) struct ScratchFolder(PathBuf);

impl ScratchFolder {
    /// Gives every call its own folder, so tests running as threads of one process never share one.
    pub(crate) fn new(name: &str) -> Self {
        let serial = CREATED.fetch_add(1, Ordering::Relaxed);
        let path = env::temp_dir()
            .join(format!("omnileaf-db-{}", process::id()))
            .join(format!("{name}-{serial}"));
        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    pub(crate) fn config(&self) -> Config {
        Config {
            path: self.0.join("library.sqlite"),
            mmap_size_bytes: MMAP_SIZE_BYTES,
        }
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
