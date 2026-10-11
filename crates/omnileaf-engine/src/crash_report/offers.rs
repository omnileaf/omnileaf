use std::sync::{Mutex, MutexGuard, PoisonError};

use super::{CrashReport, CrashReportError, CrashReportFile};

#[derive(Debug, thiserror::Error)]
#[error("keep the crash report for the next run")]
pub struct UnsavedCrashReport {
    pub report: Box<CrashReport>,
    #[source]
    pub source: CrashReportError,
}

#[derive(Debug)]
pub struct CrashReportOffers {
    file: Option<CrashReportFile>,
    offered: Mutex<Option<CrashReport>>,
}

impl CrashReportOffers {
    #[must_use]
    pub fn new(file: CrashReportFile) -> Self {
        Self {
            file: Some(file),
            offered: Mutex::new(None),
        }
    }

    #[must_use]
    pub fn in_memory() -> Self {
        Self {
            file: None,
            offered: Mutex::new(None),
        }
    }

    pub fn offer_saved(&self) -> Result<Option<CrashReport>, CrashReportError> {
        let mut offered = self.lock();
        if let (None, Some(file)) = (offered.as_ref(), &self.file) {
            *offered = match file.load() {
                Err(unreadable @ CrashReportError::Parse(_)) => {
                    file.discard()?;
                    return Err(unreadable);
                }
                loaded => loaded?,
            };
        }
        Ok(offered.clone())
    }

    pub fn offer(&self, report: CrashReport) -> Result<CrashReport, UnsavedCrashReport> {
        let mut offered = self.lock();
        if let Some(earlier) = offered.as_ref() {
            return Ok(earlier.clone());
        }
        *offered = Some(report.clone());
        let Some(file) = &self.file else {
            return Ok(report);
        };
        match file.save(&report) {
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

    pub fn settle(&self) -> Result<(), CrashReportError> {
        let settled = self.lock().take();
        match (settled, &self.file) {
            (Some(settled), Some(file)) => file.remove(settled.id()),
            _ => Ok(()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Option<CrashReport>> {
        self.offered.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
