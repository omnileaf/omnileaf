use omnileaf_db::catalog::BookReading as StoredReading;
use tokio::time::{Duration, Instant};

use omnileaf_db::store::SessionPlace;

use crate::{BookId, UtcOffset};

/// How long after the first page left unsaved reading is saved, however many pages are turned meanwhile.
pub const READING_SAVE_DELAY: Duration = Duration::from_millis(1_500);

/// A page reading reached, for the store to save.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ReachedPage {
    pub(crate) book: BookId,
    pub(crate) page: u32,
    pub(crate) page_count: u32,
    pub(crate) utc_offset: UtcOffset,
}

impl ReachedPage {
    pub(crate) const fn is_last(self) -> bool {
        self.page.saturating_add(1) >= self.page_count
    }

    /// Where the reading session the page belongs to stands.
    pub(crate) const fn place(self) -> SessionPlace {
        SessionPlace {
            book: self.book.0,
            page: self.page,
            page_count: self.page_count,
            utc_offset_minutes: self.utc_offset.minutes(),
        }
    }
}

impl ReachedPage {
    /// The reading stored once this page saves, which marks the book read on its last page and unread on any other.
    pub(crate) const fn stored(self) -> StoredReading {
        let position_page = Some(self.page);
        if self.is_last() {
            StoredReading::Read { position_page }
        } else {
            StoredReading::Started { position_page }
        }
    }
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
    utc_offset: UtcOffset,
    stage: Stage,
}

impl ReadingSession {
    /// None for a book with no pages to read.
    pub(crate) fn opening(book: BookId, page_count: usize, utc_offset: UtcOffset) -> Option<Self> {
        let last_page = u32::try_from(page_count.checked_sub(1)?).unwrap_or(u32::MAX);
        Some(Self {
            book,
            last_page,
            utc_offset,
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

    /// Leaves the page restored to unsaved, to save over `left`, a page reached before and saved ahead of it.
    pub(crate) fn restored_over(&mut self, left: u32, now: Instant) {
        if let Stage::Restored { page } = self.stage
            && page != left
        {
            self.stage = Stage::Reading {
                saved: left,
                unsaved: Some(Unsaved { page, save_at: now }),
            };
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
            save_at: unsaved.map_or(now + READING_SAVE_DELAY, |unsaved| unsaved.save_at),
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

    /// The page shown last, or nothing when it is saved already.
    pub(crate) fn unsaved(&self) -> Option<ReachedPage> {
        let Stage::Reading {
            unsaved: Some(unsaved),
            ..
        } = self.stage
        else {
            return None;
        };
        Some(self.reached(unsaved.page))
    }

    /// The page reading stands on, saved or not, or nothing while the reader hasn't restored the book.
    pub(crate) fn on_page(&self) -> Option<ReachedPage> {
        let page = match self.stage {
            Stage::Opening => return None,
            Stage::Restored { page } => page,
            Stage::Reading { saved, unsaved } => unsaved.map_or(saved, |unsaved| unsaved.page),
        };
        Some(self.reached(page))
    }

    const fn reached(&self, page: u32) -> ReachedPage {
        ReachedPage {
            book: self.book,
            page,
            page_count: self.last_page.saturating_add(1),
            utc_offset: self.utc_offset,
        }
    }

    pub(crate) fn saved(&mut self, reached: ReachedPage) {
        if let Stage::Reading { unsaved, .. } = self.stage {
            self.stage = Stage::Reading {
                saved: reached.page,
                unsaved: unsaved.filter(|unsaved| unsaved.page != reached.page),
            };
        }
    }

    /// Leaves the page shown last unsaved, to save again at `retry_at`.
    pub(crate) fn save_failed(&mut self, retry_at: Instant) {
        if let Stage::Reading {
            saved,
            unsaved: Some(unsaved),
        } = self.stage
        {
            self.stage = Stage::Reading {
                saved,
                unsaved: Some(Unsaved {
                    save_at: retry_at,
                    ..unsaved
                }),
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use proptest::{collection::vec, prelude::*};

    use super::*;
    use crate::library_book::sample_book_id as book;

    const PAGE_COUNT: usize = 8;
    const LAST_PAGE: u32 = 7;

    fn restored_on(page: u32) -> ReadingSession {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT, UtcOffset::UTC).unwrap();
        session.restored(page);
        session
    }

    fn reached(page: u32) -> ReachedPage {
        ReachedPage {
            book: book(1),
            page,
            page_count: LAST_PAGE + 1,
            utc_offset: UtcOffset::UTC,
        }
    }

    #[test]
    fn opens_no_session_for_a_book_without_pages() {
        let session = ReadingSession::opening(book(1), 0, UtcOffset::UTC);

        assert_eq!(session, None);
    }

    #[test]
    fn saves_nothing_shown_before_the_reader_restored_the_book() {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT, UtcOffset::UTC).unwrap();
        session.shown(4, Instant::now());

        let saved = session.unsaved();

        assert_eq!(saved, None);
        assert_eq!(session.save_at(), None);
    }

    #[test]
    fn saves_nothing_for_the_page_reading_was_restored_to() {
        let mut session = restored_on(3);
        session.shown(3, Instant::now());

        let saved = session.unsaved();

        assert_eq!(saved, None);
    }

    #[test]
    fn saves_the_page_shown_last() {
        let mut session = restored_on(0);
        let now = Instant::now();
        session.shown(1, now);
        session.shown(2, now);

        let unsaved = session.unsaved();

        assert_eq!(unsaved, Some(reached(2)));
    }

    #[test]
    fn has_nothing_left_to_save_once_the_page_shown_last_is_saved() {
        let mut session = restored_on(0);
        session.shown(2, Instant::now());

        session.saved(reached(2));

        assert_eq!(session.unsaved(), None);
        assert_eq!(session.save_at(), None);
    }

    #[test]
    fn saves_again_when_told_after_a_save_that_failed() {
        let mut session = restored_on(0);
        let first = Instant::now();
        session.shown(2, first);
        let retry_at = first + READING_SAVE_DELAY * 3;

        session.save_failed(retry_at);

        assert_eq!(session.unsaved(), Some(reached(2)));
        assert_eq!(session.save_at(), Some(retry_at));
    }

    #[test]
    fn has_nothing_to_save_on_turning_back_to_the_page_saved_before_a_save_that_failed() {
        let mut session = restored_on(5);
        let now = Instant::now();
        session.shown(6, now);
        session.save_failed(now + READING_SAVE_DELAY);

        session.shown(5, now + READING_SAVE_DELAY);

        assert_eq!(session.unsaved(), None);
    }

    #[test]
    fn saves_a_second_and_a_half_after_the_first_page_left_unsaved() {
        let mut session = restored_on(0);
        let shown = Instant::now();

        session.shown(1, shown);

        assert_eq!(
            session.save_at(),
            Some(shown + Duration::from_millis(1_500))
        );
    }

    #[test]
    fn saves_a_delay_after_the_first_page_left_unsaved_however_many_pages_follow() {
        let mut session = restored_on(0);
        let first = Instant::now();
        session.shown(1, first);

        session.shown(2, first + READING_SAVE_DELAY / 2);

        assert_eq!(session.save_at(), Some(first + READING_SAVE_DELAY));
    }

    #[test]
    fn has_nothing_to_save_once_reading_turns_back_to_the_page_saved() {
        let mut session = restored_on(5);
        let now = Instant::now();
        session.shown(6, now);

        session.shown(5, now);

        assert_eq!(session.save_at(), None);
        assert_eq!(session.unsaved(), None);
    }

    #[test]
    fn stands_on_no_page_before_the_reader_restored_the_book() {
        let session = ReadingSession::opening(book(1), PAGE_COUNT, UtcOffset::UTC).unwrap();

        assert_eq!(session.on_page(), None);
    }

    #[test]
    fn stands_on_the_page_restored_until_another_is_shown() {
        let mut session = restored_on(3);
        let restored = session.on_page();

        session.shown(5, Instant::now());

        assert_eq!(
            [restored, session.on_page()],
            [Some(reached(3)), Some(reached(5))]
        );
    }

    #[test]
    fn stands_on_the_page_shown_last_once_it_is_saved() {
        let mut session = restored_on(3);
        session.shown(5, Instant::now());

        session.saved(reached(5));

        assert_eq!(session.on_page(), Some(reached(5)));
    }

    #[test]
    fn places_a_session_where_the_page_reached_is_in_the_device_s_local_time() {
        let offset = UtcOffset::try_from(-300).unwrap();
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT, offset).unwrap();
        session.restored(2);

        let place = session.on_page().map(ReachedPage::place);

        assert_eq!(
            place,
            Some(SessionPlace {
                book: book(1).0,
                page: 2,
                page_count: 8,
                utc_offset_minutes: -300,
            })
        );
    }

    #[test]
    fn finishes_the_book_with_its_last_page() {
        let mut session = restored_on(6);
        session.shown(LAST_PAGE, Instant::now());

        let saved = session.unsaved();

        assert_eq!(saved.map(ReachedPage::is_last), Some(true));
    }

    #[test]
    fn ignores_a_page_past_the_book_s_end() {
        let mut session = ReadingSession::opening(book(1), PAGE_COUNT, UtcOffset::UTC).unwrap();
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

        assert_eq!(session.unsaved(), Some(reached(4)));
    }

    #[test]
    fn reads_as_read_once_its_last_page_saves_and_as_started_once_any_other_page_does() {
        let stored = [reached(4).stored(), reached(LAST_PAGE).stored()];

        assert_eq!(
            stored,
            [
                StoredReading::Started {
                    position_page: Some(4)
                },
                StoredReading::Read {
                    position_page: Some(LAST_PAGE)
                },
            ]
        );
    }

    #[derive(Clone, Copy, Debug)]
    enum Report {
        Restored(u32),
        Shown(u32),
        Saved,
        Failed,
    }

    fn any_report() -> impl Strategy<Value = Report> {
        let page = 0..=LAST_PAGE + 1;
        prop_oneof![
            page.clone().prop_map(Report::Restored),
            page.prop_map(Report::Shown),
            Just(Report::Saved),
            Just(Report::Failed),
        ]
    }

    proptest! {
        #[test]
        fn saves_only_after_the_restore_and_always_the_page_shown_last(
            reports in vec(any_report(), 0..32)
        ) {
            let mut session = ReadingSession::opening(book(1), PAGE_COUNT, UtcOffset::UTC).unwrap();
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
                        if let Some(saved) = session.unsaved() {
                            prop_assert!(restored.is_some());
                            prop_assert_eq!(Some(saved.page), on_page);
                            prop_assert_eq!(saved.is_last(), saved.page == LAST_PAGE);
                            session.saved(saved);
                        }
                    }
                    Report::Failed => session.save_failed(now),
                }
            }
        }
    }
}
