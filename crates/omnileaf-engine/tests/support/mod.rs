#![expect(
    clippy::unwrap_used,
    reason = "the test folders are fixtures, so a failed set-up should stop the test"
)]

use std::{
    env, fs,
    path::{Path, PathBuf},
    process,
};

pub(crate) struct TempFolder(PathBuf);

impl TempFolder {
    pub(crate) fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-engine-{}", process::id()))
            .join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    pub(crate) fn with_files(self, files: &[&str]) -> Self {
        for file in files {
            let path = self.0.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"").unwrap();
        }
        self
    }

    pub(crate) fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
