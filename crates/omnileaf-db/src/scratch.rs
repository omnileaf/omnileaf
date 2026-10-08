use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::atomic::{AtomicUsize, Ordering},
};

use rusqlite::{Connection, params_from_iter, types::Null};

use crate::{Config, Database};

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

    pub(crate) fn query_plan(&self, sql: &str) -> Vec<String> {
        drop(Database::open(&self.config).unwrap());
        let connection = Connection::open(&self.config.path).unwrap();
        let mut statement = connection
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .unwrap();
        let unbound = vec![Null; statement.parameter_count()];
        statement
            .query_map(params_from_iter(unbound), |row| row.get("detail"))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
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
