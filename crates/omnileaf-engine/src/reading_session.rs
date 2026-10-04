use tokio::time::{Duration, Instant};

use crate::BookId;

/// How long after the first page left unsaved reading is saved, however many pages are turned meanwhile.
pub(crate) const SAVE_DELAY: Duration = Duration::from_millis(1_500);

/// A page reading reached, for the store to save.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ReachedPage {
    pub(crate) book: BookId,
    pub(crate) page: u32,
    pub(crate) is_last: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Unsaved {
    page: u32,
    save_at: Instant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stage {
    /// The reader hasn't shown the page reading was restored to, so nothing it reports is saved.
    Opening,
    Restored {
        page: u32,
    },
    Reading {
        saved: u32,
        unsaved: Option<Unsaved>,
    },
}

/// One book's reading, from opening it until it closes, counting pages from 0.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ReadingSession {
    book: BookId,
    last_page: u32,
    stage: Stage,
}

impl ReadingSession {
    /// None for a book with no pages to read.
    pub(crate) fn opening(book: BookId, page_count: usize) -> Option<Self> {
        let last_page = u32::try_from(page_count.checked_sub(1)?).unwrap_or(u32::MAX);
        Some(Self {
            book,
            last_page,
            stage: Stage::Opening,
        })
    }

    pub(crate) const fn book(&self) -> BookId {
        self.book
    }

    /// Leaves a session restored before, or a page past the book's end, as it is.
    pub(crate) fn restored(&mut self, page: u32) {
        if self.stage == Stage::Opening && page <= self.last_page {
            self.stage = Stage::Restored { page };
        }
    }

    /// Leaves a session still opening, or a page past the book's end, as it is.
    pub(crate) fn shown(&mut self, page: u32, now: Instant) {
        if page > self.last_page {
            return;
        }
        let (saved, unsaved) = match self.stage {
            Stage::Opening => return,
            Stage::Restored { page } => (page, None),
            Stage::Reading { saved, unsaved } => (saved, unsaved),
        };
        let unsaved = (page != saved).then(|| Unsaved {
            page,
            save_at: unsaved.map_or(now + SAVE_DELAY, |unsaved| unsaved.save_at),
        });
        self.stage = Stage::Reading { saved, unsaved };
    }

    /// When the page shown last is due to be saved, or nothing while every page shown is saved.
    pub(crate) fn save_at(&self) -> Option<Instant> {
        match self.stage {
            Stage::Reading {
                unsaved: Some(unsaved),
                ..
            } => Some(unsaved.save_at),
            Stage::Opening | Stage::Restored { .. } | Stage::Reading { unsaved: None, .. } => None,
        }
    }

    /// The page shown last, counted from then on as saved, or nothing when it is saved already.
    pub(crate) fn take_unsaved(&mut self) -> Option<ReachedPage> {
        let Stage::Reading {
            unsaved: Some(unsaved),
            ..
        } = self.stage
        else {
            return None;
        };
        self.stage = Stage::Reading {
            saved: unsaved.page,
            unsaved: None,
        };
        Some(ReachedPage {
            book: self.book,
            page: unsaved.page,
            is_last: unsaved.page == self.last_page,
        })
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};
    use proptest::{collection::vec, prelude::*};

    use super::*;

    const PAGE_COUNT: usize = 8;
    const LAST_PAGE: u32 = 7;

    fn book(seed: u32) -> BookId {
        let fingerprint = Fingerprint::pmf1([ImageEntry {
            crc32: seed,
            size: 1,
        }])
        .unwrap();
        BookId(omnileaf_sync_proto::BookId::local(&fingerprint))
    }

    fn restored_on(page: u32) -> ReadingSession {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT).unwrap();
        session.restored(page);
        session
    }

    fn reached(page: u32) -> ReachedPage {
        ReachedPage {
            book: book(1),
            page,
            is_last: page == LAST_PAGE,
        }
    }

    #[test]
    fn opens_no_session_for_a_book_without_pages() {
        let session = ReadingSession::opening(book(1), 0);

        assert_eq!(session, None);
    }

    #[test]
    fn saves_nothing_shown_before_the_reader_restored_the_book() {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT).unwrap();
        session.shown(4, Instant::now());

        let saved = session.take_unsaved();

        assert_eq!(saved, None);
        assert_eq!(session.save_at(), None);
    }

    #[test]
    fn saves_nothing_for_the_page_reading_was_restored_to() {
        let mut session = restored_on(3);
        session.shown(3, Instant::now());

        let saved = session.take_unsaved();

        assert_eq!(saved, None);
    }

    #[test]
    fn saves_the_page_shown_last_once() {
        let mut session = restored_on(0);
        let now = Instant::now();
        session.shown(1, now);
        session.shown(2, now);

        let saved = [session.take_unsaved(), session.take_unsaved()];

        assert_eq!(saved, [Some(reached(2)), None]);
    }

    #[test]
    fn saves_a_delay_after_the_first_page_left_unsaved_however_many_pages_follow() {
        let mut session = restored_on(0);
        let first = Instant::now();
        session.shown(1, first);

        session.shown(2, first + SAVE_DELAY / 2);

        assert_eq!(session.save_at(), Some(first + SAVE_DELAY));
    }

    #[test]
    fn has_nothing_to_save_once_reading_turns_back_to_the_page_saved() {
        let mut session = restored_on(5);
        let now = Instant::now();
        session.shown(6, now);

        session.shown(5, now);

        assert_eq!(session.save_at(), None);
        assert_eq!(session.take_unsaved(), None);
    }

    #[test]
    fn finishes_the_book_with_its_last_page() {
        let mut session = restored_on(6);
        session.shown(LAST_PAGE, Instant::now());

        let saved = session.take_unsaved();

        assert_eq!(saved.map(|page| page.is_last), Some(true));
    }

    #[test]
    fn ignores_a_page_past_the_book_s_end() {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT).unwrap();
        session.restored(LAST_PAGE + 1);
        session.restored(2);

        session.shown(LAST_PAGE + 1, Instant::now());

        assert_eq!(session, restored_on(2));
    }

    #[test]
    fn keeps_the_page_restored_first_when_told_again() {
        let mut session = restored_on(2);

        session.restored(4);
        session.shown(4, Instant::now());

        assert_eq!(session.take_unsaved(), Some(reached(4)));
    }

    #[derive(Clone, Copy, Debug)]
    enum Report {
        Restored(u32),
        Shown(u32),
        Saved,
    }

    fn any_report() -> impl Strategy<Value = Report> {
        let page = 0..=LAST_PAGE + 1;
        prop_oneof![
            page.clone().prop_map(Report::Restored),
            page.prop_map(Report::Shown),
            Just(Report::Saved),
        ]
    }

    proptest! {
        #[test]
        fn saves_only_after_the_restore_and_always_the_page_shown_last(
            reports in vec(any_report(), 0..32)
        ) {
            let mut session = ReadingSession::opening(book(1), PAGE_COUNT).unwrap();
            let now = Instant::now();
            let mut restored = None;
            let mut on_page = None;
            for report in reports {
                match report {
                    Report::Restored(page) => {
                        session.restored(page);
                        if restored.is_none() && page <= LAST_PAGE {
                            restored = Some(page);
                            on_page = Some(page);
                        }
                    }
                    Report::Shown(page) => {
                        session.shown(page, now);
                        if restored.is_some() && page <= LAST_PAGE {
                            on_page = Some(page);
                        }
                    }
                    Report::Saved => {
                        if let Some(saved) = session.take_unsaved() {
                            prop_assert!(restored.is_some());
                            prop_assert_eq!(Some(saved.page), on_page);
                            prop_assert_eq!(saved.is_last, saved.page == LAST_PAGE);
                        }
                    }
                }
            }
        }
    }
}
