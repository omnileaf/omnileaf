use omnileaf_formats::FormatError;

use crate::{scan::UnreadableBook, skipped_types::SkippedTypes};

#[derive(Debug, Default)]
pub(crate) struct UnreadBooks {
    pub(crate) unreadable: u32,
    pub(crate) unsupported: u32,
    pub(crate) skipped: SkippedTypes,
}

impl UnreadBooks {
    pub(crate) fn count(&mut self, unread: &UnreadableBook) {
        match unread {
            UnreadableBook::HiddenType(_) => {}
            UnreadableBook::UnsupportedType { skipped, .. } => {
                self.unsupported = self.unsupported.saturating_add(1);
                self.skipped.note(skipped);
            }
            UnreadableBook::Format(FormatError::ArchiveNotSupportedYet { .. }) => {
                self.unsupported = self.unsupported.saturating_add(1);
            }
            UnreadableBook::Format(_)
            | UnreadableBook::Metadata(_)
            | UnreadableBook::SeriesName(_)
            | UnreadableBook::OutsideFolder(_) => {
                self.unreadable = self.unreadable.saturating_add(1);
            }
        }
    }
}
