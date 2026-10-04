use std::{
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicU64, Ordering},
};

use super::{CrashReport, StoredCrashReport};

const FILE_NAME: &str = "crash-report.json";
const UNFINISHED_SUFFIX: &str = "partial";
const MAX_SAVED_BYTES: u64 = 64 * 1024;

/// Numbers every save in the process, so saves on two threads at once never write the same side file.
static SAVES: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, thiserror::Error)]
pub enum CrashReportError {
    #[error("save the crash report")]
    Save(#[source] io::Error),
    #[error("encode the crash report")]
    Encode(#[source] serde_json::Error),
    #[error("read the saved crash report")]
    Read(#[source] io::Error),
    #[error("parse the saved crash report")]
    Parse(#[source] serde_json::Error),
}

/// The one crash report kept on disk between runs, so a crash can be offered when the app next opens.
#[derive(Clone, Debug)]
pub struct CrashReportFile {
    folder: PathBuf,
}

impl CrashReportFile {
    #[must_use]
    pub fn in_folder(folder: &Path) -> Self {
        Self {
            folder: folder.to_path_buf(),
        }
    }

    /// Replaces any saved report, writing to a side file first so a crash mid-write leaves the old one whole.
    pub fn save(&self, report: &CrashReport) -> Result<(), CrashReportError> {
        let text = serde_json::to_vec(&StoredCrashReport::from(report))
            .map_err(CrashReportError::Encode)?;
        let unfinished = self.unfinished_path();
        fs::create_dir_all(&self.folder)
            .and_then(|()| fs::write(&unfinished, text))
            .and_then(|()| fs::rename(&unfinished, self.path()))
            .map_err(|error| {
                let _ = fs::remove_file(&unfinished);
                CrashReportError::Save(error)
            })
    }

    /// Reads at most a report's worth of the file, so a damaged one fails to parse rather than filling memory.
    pub fn load(&self) -> Result<Option<CrashReport>, CrashReportError> {
        let mut text = Vec::new();
        let read = File::open(self.path())
            .and_then(|file| file.take(MAX_SAVED_BYTES).read_to_end(&mut text));
        if let Err(error) = read {
            return match error.kind() {
                io::ErrorKind::NotFound => Ok(None),
                _ => Err(CrashReportError::Read(error)),
            };
        }
        serde_json::from_slice::<StoredCrashReport>(&text)
            .map(|stored| Some(CrashReport::from(stored)))
            .map_err(CrashReportError::Parse)
    }

    fn path(&self) -> PathBuf {
        self.folder.join(FILE_NAME)
    }

    fn unfinished_path(&self) -> PathBuf {
        let save = SAVES.fetch_add(1, Ordering::Relaxed);
        self.folder.join(format!(
            "{FILE_NAME}.{}-{save}.{UNFINISHED_SUFFIX}",
            process::id()
        ))
    }
}
