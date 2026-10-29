use std::{future::ready, io, path::Path};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Disposal {
    Trashed,
    Deleted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum DisposalFailure {
    #[error("the file is not there")]
    NotFound,
    #[error("the file may not be removed")]
    PermissionDenied,
    #[error("another program holds the file open")]
    Locked,
    #[error("the place the file is in cannot have files removed")]
    Unsupported,
    #[error("the file could not be removed")]
    Other,
}

pub trait FileDisposal: Send + Sync {
    fn dispose(
        &self,
        file: &Path,
    ) -> impl Future<Output = Result<Disposal, DisposalFailure>> + Send;
}

pub enum FileFate<'a, D> {
    Keep,
    Dispose(&'a D),
}

#[derive(Clone, Copy, Debug)]
pub enum NoDisposal {}

impl FileFate<'_, NoDisposal> {
    #[must_use]
    pub const fn keep() -> Self {
        Self::Keep
    }
}

impl FileDisposal for NoDisposal {
    fn dispose(
        &self,
        _file: &Path,
    ) -> impl Future<Output = Result<Disposal, DisposalFailure>> + Send {
        ready(Err(DisposalFailure::Unsupported))
    }
}

impl From<io::ErrorKind> for DisposalFailure {
    fn from(kind: io::ErrorKind) -> Self {
        match kind {
            io::ErrorKind::NotFound => Self::NotFound,
            io::ErrorKind::PermissionDenied => Self::PermissionDenied,
            io::ErrorKind::ResourceBusy => Self::Locked,
            io::ErrorKind::Unsupported | io::ErrorKind::ReadOnlyFilesystem => Self::Unsupported,
            _ => Self::Other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_error_kind_a_removal_meets_as_its_own_failure() {
        let kinds = [
            io::ErrorKind::NotFound,
            io::ErrorKind::PermissionDenied,
            io::ErrorKind::ResourceBusy,
            io::ErrorKind::Unsupported,
            io::ErrorKind::ReadOnlyFilesystem,
            io::ErrorKind::TimedOut,
        ];

        let failures = kinds.map(DisposalFailure::from);

        assert_eq!(
            failures,
            [
                DisposalFailure::NotFound,
                DisposalFailure::PermissionDenied,
                DisposalFailure::Locked,
                DisposalFailure::Unsupported,
                DisposalFailure::Unsupported,
                DisposalFailure::Other,
            ]
        );
    }
}
