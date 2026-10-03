use std::sync::{Mutex, MutexGuard, PoisonError};

use super::{CrashReport, CrashReportError, CrashReportFile};

#[derive(Debug, thiserror::Error)]
#[error("keep the crash report for the next run")]
pub struct UnsavedCrashReport {
    pub report: Box<CrashReport>,
    #[source]
    pub source: CrashReportError,
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
