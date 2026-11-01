use std::{
    fmt,
    fs::File,
    io,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use omnileaf_engine::OpenTree;
use omnileaf_formats::{Details, Entry, LocalStorage, Storage};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};

use crate::support::ScratchFolder;

pub(crate) struct TreeOfFolder {
    pub(crate) scratch: ScratchFolder,
    opened: Mutex<Vec<PathBuf>>,
    is_lost: AtomicBool,
}

impl TreeOfFolder {
    pub(crate) fn new(name: &str) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        write_sample_library(scratch.path()).unwrap();
        Arc::new(Self {
            scratch,
            opened: Mutex::new(Vec::new()),
            is_lost: AtomicBool::new(false),
        })
    }

    pub(crate) fn lose_access(&self) {
        self.is_lost.store(true, Ordering::SeqCst);
    }

    fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
        if self.is_lost.load(Ordering::SeqCst) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        let inside = path
            .strip_prefix(SAMPLE_LIBRARY_NAME)
            .map_err(|_| io::Error::from(io::ErrorKind::NotFound))?;
        Ok(self.scratch.path().join(SAMPLE_LIBRARY_NAME).join(inside))
    }

    pub(crate) fn take_opened(&self) -> Vec<PathBuf> {
        std::mem::take(&mut self.opened.lock().unwrap())
    }

    pub(crate) fn opener(self: &Arc<Self>) -> OpenTree {
        let tree = Arc::clone(self);
        Arc::new(move |_| Arc::clone(&tree) as Arc<dyn Storage>)
    }
}

impl fmt::Debug for TreeOfFolder {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TreeOfFolder")
            .finish_non_exhaustive()
    }
}

impl Storage for TreeOfFolder {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        LocalStorage.entries(&self.on_device(folder)?)
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        LocalStorage.details(&self.on_device(path)?)
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        self.opened.lock().unwrap().push(file.to_path_buf());
        LocalStorage.open(&self.on_device(file)?)
    }
}
