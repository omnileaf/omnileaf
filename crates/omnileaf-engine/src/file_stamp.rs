use std::{io, path::Path, sync::Arc};

use omnileaf_formats::{Book, Details, FormatError, Limits, Storage, open_book_in};

use crate::{clock::stored_ms, unreadable_book::UnreadableBook};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct FileStamp {
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
}

impl FileStamp {
    pub(crate) fn read(storage: &Arc<dyn Storage>, path: &Path) -> Result<Self, UnreadableBook> {
        Self::of(storage.details(path)?, || {
            open_book_in(Arc::clone(storage), path, &Limits::default())
                .map(|book| page_bytes(&book))
        })
    }

    pub(crate) fn of(
        details: Details,
        folder_page_bytes: impl FnOnce() -> Result<u64, FormatError>,
    ) -> Result<Self, UnreadableBook> {
        let (Details::Folder { modified } | Details::File { modified, .. }) = details;
        let modified = modified.ok_or_else(|| io::Error::from(io::ErrorKind::Unsupported))?;
        let size_bytes = match details {
            Details::Folder { .. } => folder_page_bytes()?,
            Details::File { size, .. } => size,
        };
        Ok(Self {
            size_bytes,
            modified_at_ms: stored_ms(modified),
        })
    }
}

pub(crate) fn page_bytes(book: &Book) -> u64 {
    book.pages().iter().map(|page| page.size).sum()
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime};

    use super::*;

    #[test]
    fn stamps_a_file_with_the_size_and_change_time_its_storage_gives() {
        let details = Details::File {
            size: 2048,
            modified: Some(SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)),
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own")).unwrap();

        assert_eq!(
            stamp,
            FileStamp {
                size_bytes: 2048,
                modified_at_ms: 1_700_000_000_000,
            }
        );
    }

    #[test]
    fn refuses_a_book_whose_storage_cannot_tell_when_it_last_changed() {
        let details = Details::File {
            size: 2048,
            modified: None,
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own"));

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }

    #[test]
    fn refuses_a_folder_book_with_no_change_time_without_opening_it() {
        let details = Details::Folder { modified: None };

        let stamp = FileStamp::of(details, || {
            unreachable!("the stamp is refused before the pages are added up")
        });

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }
}
