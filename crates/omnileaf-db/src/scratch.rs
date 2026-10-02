use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::atomic::{AtomicUsize, Ordering},
};

use crate::Config;

static CREATED: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct ScratchLibrary {
    folder: PathBuf,
    pub(crate) config: Config,
}

impl ScratchLibrary {
    /// Gives every call its own folder, so tests running as threads of one process never share one.
    pub(crate) fn new(name: &str) -> Self {
        let serial = CREATED.fetch_add(1, Ordering::Relaxed);
        let folder = env::temp_dir()
            .join(format!("omnileaf-db-unit-{}", process::id()))
            .join(format!("{name}-{serial}"));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        let config = Config {
            path: folder.join("library.sqlite"),
            backup_dir: folder.join("backups"),
            mmap_size_bytes: 0,
        };
        Self { folder, config }
    }

    pub(crate) fn backup_path(&self, schema_version: u32) -> PathBuf {
        self.config
            .backup_dir
            .join(format!("schema-v{schema_version}.sqlite"))
    }
}

impl Drop for ScratchLibrary {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}
