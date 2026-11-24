#![expect(
    dead_code,
    reason = "each test file reads, paces or changes only some of the tree, so the helpers it leaves out go unused there"
)]

use std::{
    fmt,
    fs::File,
    io,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime},
};

use omnileaf_engine::OpenTree;
use omnileaf_formats::{Details, Entry, LocalStorage, Storage};
use omnileaf_testkit::{
    GENERATED_LIBRARY_NAME, GeneratedLibrary, SAMPLE_LIBRARY_NAME, write_generated_library,
    write_sample_library,
};

use crate::support::ScratchFolder;

const ARCHIVE_EXTENSION: &str = "cbz";

pub(crate) struct TreeOfFolder {
    pub(crate) scratch: ScratchFolder,
    library: WrittenLibrary,
    opening: Opening,
    opened: Mutex<Vec<PathBuf>>,
    open_now: AtomicUsize,
    most_open_at_once: AtomicUsize,
    is_lost: AtomicBool,
}

struct WrittenLibrary {
    name: &'static str,
    files: Vec<PathBuf>,
}

#[derive(Clone, Copy)]
pub(crate) enum Opening {
    Immediately,
    After(Duration),
    InCompanyWithin(Duration),
    TimingOutInCompanyWithin(Duration),
}

impl TreeOfFolder {
    pub(crate) fn new(name: &str) -> Arc<Self> {
        Self::opening(name, Opening::Immediately)
    }

    pub(crate) fn opening(name: &str, opening: Opening) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        let library = WrittenLibrary {
            name: SAMPLE_LIBRARY_NAME,
            files: write_sample_library(scratch.path()).unwrap(),
        };
        Self::holding(scratch, library, opening)
    }

    pub(crate) fn generated(name: &str, library: GeneratedLibrary, opening: Opening) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        let library = WrittenLibrary {
            name: GENERATED_LIBRARY_NAME,
            files: write_generated_library(scratch.path(), library).unwrap(),
        };
        Self::holding(scratch, library, opening)
    }

    fn holding(scratch: ScratchFolder, library: WrittenLibrary, opening: Opening) -> Arc<Self> {
        Arc::new(Self {
            scratch,
            library,
            opening,
            opened: Mutex::new(Vec::new()),
            open_now: AtomicUsize::new(0),
            most_open_at_once: AtomicUsize::new(0),
            is_lost: AtomicBool::new(false),
        })
    }

    pub(crate) fn lose_access(&self) {
        self.is_lost.store(true, Ordering::SeqCst);
    }

    pub(crate) fn change_every_archive(&self, modified: SystemTime) {
        for archive in self
            .library
            .files
            .iter()
            .filter(|file| file.extension().is_some_and(|ext| ext == ARCHIVE_EXTENSION))
        {
            File::options()
                .write(true)
                .open(self.scratch.path().join(archive))
                .unwrap()
                .set_modified(modified)
                .unwrap();
        }
    }

    fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
        if self.is_lost.load(Ordering::SeqCst) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        let inside = path
            .strip_prefix(self.library.name)
            .map_err(|_| io::Error::from(io::ErrorKind::NotFound))?;
        Ok(self.scratch.path().join(self.library.name).join(inside))
    }

    pub(crate) fn take_opened(&self) -> Vec<PathBuf> {
        std::mem::take(&mut self.opened.lock().unwrap())
    }

    pub(crate) fn take_most_open_at_once(&self) -> usize {
        self.most_open_at_once.swap(0, Ordering::SeqCst)
    }

    pub(crate) fn opener(self: &Arc<Self>) -> OpenTree {
        let tree = Arc::clone(self);
        Arc::new(move |_| Arc::clone(&tree) as Arc<dyn Storage>)
    }

    fn has_opened_two_at_once(&self) -> bool {
        self.most_open_at_once.load(Ordering::SeqCst) > 1
    }

    fn has_company(&self) -> bool {
        self.open_now.load(Ordering::SeqCst) > 1
    }

    fn wait_until(longest: Duration, is_done: impl Fn() -> bool) {
        let deadline = Instant::now() + longest;
        while !is_done() && Instant::now() < deadline {
            thread::yield_now();
        }
    }

    fn wait_to_open(&self) -> io::Result<()> {
        match self.opening {
            Opening::Immediately => Ok(()),
            Opening::After(latency) => {
                thread::sleep(latency);
                Ok(())
            }
            Opening::InCompanyWithin(longest) => {
                Self::wait_until(longest, || self.has_opened_two_at_once());
                Ok(())
            }
            Opening::TimingOutInCompanyWithin(longest) => {
                Self::wait_until(longest, || self.has_company());
                if self.has_company() {
                    Err(io::ErrorKind::TimedOut.into())
                } else {
                    Ok(())
                }
            }
        }
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
        let now = self.open_now.fetch_add(1, Ordering::SeqCst) + 1;
        self.most_open_at_once.fetch_max(now, Ordering::SeqCst);
        let opened = self
            .wait_to_open()
            .and_then(|()| self.on_device(file))
            .and_then(|on_device| LocalStorage.open(&on_device));
        self.open_now.fetch_sub(1, Ordering::SeqCst);
        opened
    }
}
