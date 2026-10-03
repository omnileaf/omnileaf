use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use super::{CrashReport, CrashReportId, StoredCrashReport};

const FILE_NAME: &str = "crash-report.json";
const UNFINISHED_FILE_NAME: &str = "crash-report.json.partial";

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
    #[error("remove the saved crash report")]
    Remove(#[source] io::Error),
}

#[derive(Debug, thiserror::Error)]
#[error("keep the crash report for the next run")]
pub struct UnsavedCrashReport {
    pub report: Box<CrashReport>,
    #[source]
    pub source: CrashReportError,
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
        let unfinished = self.folder.join(UNFINISHED_FILE_NAME);
        fs::create_dir_all(&self.folder)
            .and_then(|()| fs::write(&unfinished, text))
            .and_then(|()| fs::rename(&unfinished, self.path()))
            .map_err(CrashReportError::Save)
    }

    pub fn load(&self) -> Result<Option<CrashReport>, CrashReportError> {
        let text = match fs::read(self.path()) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(CrashReportError::Read(error)),
        };
        serde_json::from_slice::<StoredCrashReport>(&text)
            .map(|stored| Some(CrashReport::from(stored)))
            .map_err(CrashReportError::Parse)
    }

    /// Removes the saved report only if it is still the one with `id`, leaving a newer crash for later.
    pub fn remove(&self, id: CrashReportId) -> Result<(), CrashReportError> {
        match self.load() {
            Ok(Some(saved)) if saved.id() != id => Ok(()),
            Ok(None) => Ok(()),
            Ok(Some(_)) | Err(CrashReportError::Parse(_)) => self.discard(),
            Err(error) => Err(error),
        }
    }

    fn discard(&self) -> Result<(), CrashReportError> {
        match fs::remove_file(self.path()) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => {
                Err(CrashReportError::Remove(error))
            }
            _ => Ok(()),
        }
    }

    fn path(&self) -> PathBuf {
        self.folder.join(FILE_NAME)
    }
}

/// The report the person is being asked about, which stays the same until they decide.
#[derive(Debug)]
pub struct CrashReportOffers {
    file: CrashReportFile,
    offered: Mutex<Option<CrashReport>>,
}

impl CrashReportOffers {
    #[must_use]
    pub fn new(file: CrashReportFile) -> Self {
        Self {
            file,
            offered: Mutex::new(None),
        }
    }

    /// Offers the report saved by an earlier run, or the one already on offer.
    pub fn offer_saved(&self) -> Result<Option<CrashReport>, CrashReportError> {
        let mut offered = self.lock();
        if offered.is_none() {
            *offered = match self.file.load() {
                Err(unreadable @ CrashReportError::Parse(_)) => {
                    self.file.discard()?;
                    return Err(unreadable);
                }
                loaded => loaded?,
            };
        }
        Ok(offered.clone())
    }

    /// Saves and offers `report`, unless another is already on offer, which is returned instead.
    ///
    /// # Errors
    /// A report that couldn't be saved is still on offer, and the error carries it.
    pub fn offer(&self, report: CrashReport) -> Result<CrashReport, UnsavedCrashReport> {
        let mut offered = self.lock();
        if let Some(earlier) = offered.as_ref() {
            return Ok(earlier.clone());
        }
        *offered = Some(report.clone());
        match self.file.save(&report) {
            Ok(()) => Ok(report),
            Err(source) => Err(UnsavedCrashReport {
                report: Box::new(report),
                source,
            }),
        }
    }

    #[must_use]
    pub fn offered(&self) -> Option<CrashReport> {
        self.lock().clone()
    }

    /// Ends the offer once the person has sent or declined the report.
    pub fn settle(&self) -> Result<(), CrashReportError> {
        let Some(settled) = self.lock().take() else {
            return Ok(());
        };
        self.file.remove(settled.id())
    }

    fn lock(&self) -> MutexGuard<'_, Option<CrashReport>> {
        self.offered.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
