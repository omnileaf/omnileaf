use std::{fmt, io, path::Path};

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

/// The returned future is dropped after thirty seconds, so an implementation that hands the work to a thread must have the thread check it is still wanted before acting, and a call already past that check can still remove the file after the report said it failed.
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

impl<D> fmt::Debug for FileFate<'_, D> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Keep => formatter.write_str("Keep"),
            Self::Dispose(_) => formatter.debug_tuple("Dispose").finish_non_exhaustive(),
        }
    }
}

impl FileFate<'_, NoDisposal> {
    #[must_use]
    pub const fn keep() -> Self {
        Self::Keep
    }
}

impl FileDisposal for NoDisposal {
    #[expect(
        clippy::unused_async_trait_impl,
        reason = "an empty enum has no value to call this on, so the body is the proof that it never runs"
    )]
    async fn dispose(&self, _file: &Path) -> Result<Disposal, DisposalFailure> {
        match *self {}
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
    use std::future::ready;

    use super::*;

    struct Trash;

    impl FileDisposal for Trash {
        fn dispose(
            &self,
            _file: &Path,
        ) -> impl Future<Output = Result<Disposal, DisposalFailure>> + Send {
            ready(Ok(Disposal::Trashed))
        }
    }

    #[test]
    fn prints_a_file_fate_without_needing_its_disposal_to_print() {
        let trash = Trash;

        let printed = (
            format!("{:?}", FileFate::keep()),
            format!("{:?}", FileFate::Dispose(&trash)),
        );

        assert_eq!(printed, ("Keep".to_owned(), "Dispose(..)".to_owned()));
    }

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
