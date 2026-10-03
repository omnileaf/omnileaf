use std::{
    fs, io,
    path::{Path, PathBuf},
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

    pub(super) fn discard(&self) -> Result<(), CrashReportError> {
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
