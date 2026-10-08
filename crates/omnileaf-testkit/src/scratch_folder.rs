use std::{
    env, fs,
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicUsize, Ordering},
};

static CREATED: AtomicUsize = AtomicUsize::new(0);

/// An empty folder under the system's temporary folder, removed with what it holds when dropped.
pub struct ScratchFolder {
    holder: PathBuf,
    path: PathBuf,
}

impl ScratchFolder {
    /// Gives every call a folder of its own named `name`, so tests running as threads of one process never share one.
    #[must_use]
    #[expect(
        clippy::panic,
        reason = "a scratch folder is test set-up, so a failure should stop the test"
    )]
    pub fn new(name: &str) -> Self {
        let serial = CREATED.fetch_add(1, Ordering::Relaxed);
        let holder = env::temp_dir()
            .join(format!("omnileaf-scratch-{}", process::id()))
            .join(serial.to_string());
        if holder.exists() {
            fs::remove_dir_all(&holder)
                .unwrap_or_else(|error| panic!("clear {}: {error}", holder.display()));
        }
        let path = holder.join(name);
        fs::create_dir_all(&path)
            .unwrap_or_else(|error| panic!("create {}: {error}", path.display()));
        Self { holder, path }
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Writes `bytes` at `name` inside the folder, making the folders on its way, and returns where.
    #[expect(
        clippy::panic,
        reason = "a scratch folder is test set-up, so a failure should stop the test"
    )]
    #[expect(
        clippy::must_use_candidate,
        reason = "callers write for the file, and the path is only a convenience"
    )]
    pub fn write(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.path.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .unwrap_or_else(|error| panic!("create {}: {error}", parent.display()));
        }
        fs::write(&path, bytes).unwrap_or_else(|error| panic!("write {}: {error}", path.display()));
        path
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.holder);
    }
}
