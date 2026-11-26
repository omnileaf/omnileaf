use std::{
    error::Error,
    io, iter,
    path::{Path, StripPrefixError},
};

use omnileaf_formats::FormatError;
use omnileaf_sync_proto::KeyError;

use crate::{
    file_type::{FileType, HiddenFileTypes},
    library_layout::FoundBook,
    skipped_types::SkippedFile,
};

#[derive(Debug, thiserror::Error)]
pub(crate) enum UnreadableBook {
    #[error("open the book")]
    Format(#[from] FormatError),
    #[error("open the book, a file of a type the library hides")]
    HiddenType(#[source] FormatError),
    #[error("open the book, a {} file this build can't read", .skipped.file_type)]
    UnsupportedType {
        skipped: Box<SkippedFile>,
        #[source]
        source: FormatError,
    },
    #[error("read when the book last changed")]
    Metadata(#[from] io::Error),
    #[error("name the book's series")]
    SeriesName(#[from] KeyError),
    #[error("place the book inside the folder scanned")]
    OutsideFolder(#[from] StripPrefixError),
}

impl UnreadableBook {
    pub(crate) fn opening(location: &Path, hidden: &HiddenFileTypes, source: FormatError) -> Self {
        match FileType::of(location) {
            Some(file_type) if file_type.is_unsupported_given(&source) => {
                if hidden.hides(location) {
                    Self::HiddenType(source)
                } else {
                    Self::UnsupportedType {
                        skipped: Box::new(SkippedFile {
                            file_type,
                            location: location.to_path_buf(),
                        }),
                        source,
                    }
                }
            }
            Some(_) | None => Self::Format(source),
        }
    }

    pub(crate) fn is_hidden(&self) -> bool {
        matches!(self, Self::HiddenType(_))
    }

    pub(crate) fn has_timed_out(&self) -> bool {
        iter::successors(Some(self as &(dyn Error + 'static)), |&error| {
            error.source()
        })
        .filter_map(|error| error.downcast_ref::<io::Error>())
        .any(|error| error.kind() == io::ErrorKind::TimedOut)
    }
}

pub(crate) fn warn_unreadable(found: &FoundBook, error: &UnreadableBook) {
    tracing::warn!(
        path = %found.path.display(),
        error = error as &dyn Error,
        "skip a book the scan can't read"
    );
}
