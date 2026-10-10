use std::{collections::HashMap, future, sync::Arc};

use omnileaf_db::{
    Error,
    store::{Store, Writer},
};
use tokio::{
    sync::{broadcast, mpsc, oneshot},
    task::JoinHandle,
    time::{Duration, Instant, sleep_until},
};

use crate::{
    BookId, LibraryError, SeriesId, UtcOffset, describe_error,
    reading_session::{READING_SAVE_DELAY, ReachedPage, ReadingSession},
};

const REPORT_BACKLOG: usize = 64;
const SAVED_BACKLOG: usize = 64;
/// The longest a save waits to try again, however long the store keeps failing.
const LONGEST_RETRY_WAIT: Duration = Duration::from_secs(60);

type Saved = oneshot::Sender<Result<(), Error>>;

/// A page reached in a book is saved, so what shows the book's place in its series is out of date.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReadingSaved {
    pub book: BookId,
    pub series: SeriesId,
}

enum Report {
    Opened {
        book: BookId,
        page_count: usize,
        saved: Saved,
    },
    Restored {
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
        saved: Saved,
    },
    Shown {
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    },
    Closed {
        book: BookId,
        saved: Saved,
    },
    SaveNow {
        saved: Saved,
    },
    PutAway {
        saved: Saved,
    },
    SaveBeforeOpening {
        book: BookId,
        unsaved: oneshot::Sender<Option<ReachedPage>>,
    },
}

/// Saves where the reader is through the store's write path, a moment after each page turn and at once when asked.
pub(crate) struct ReadingProgress {
    reports: mpsc::Sender<Report>,
    saved: broadcast::Sender<ReadingSaved>,
    _task: JoinHandle<()>,
}

impl ReadingProgress {
    /// Starts the task that saves progress, which saves whatever is unsaved and stops once this is dropped.
    pub(crate) fn start(store: Arc<Store>) -> Self {
        let (reports, received) = mpsc::channel(REPORT_BACKLOG);
        let saved = broadcast::Sender::new(SAVED_BACKLOG);
        Self {
            reports,
            _task: tokio::spawn(keep(Keeper::new(store, saved.clone()), received)),
            saved,
        }
    }

    /// A receiver that falls too far behind loses the oldest saves and is told how many it missed.
    pub(crate) fn subscribe(&self) -> broadcast::Receiver<ReadingSaved> {
        self.saved.subscribe()
    }

    /// Saves the page reached in the book read now, and keeps `book`'s length for when the reader restores it.
    pub(crate) async fn opened(&self, book: BookId, page_count: usize) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Opened {
            book,
            page_count,
            saved,
        })
        .await
    }

    /// Saves the page reached in the book read before, then records a reading session in `book` and saves from now on the pages shown in it.
    pub(crate) async fn restored(
        &self,
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    ) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Restored {
            book,
            page,
            utc_offset,
            saved,
        })
        .await
    }

    /// Reads the device's offset from UTC afresh, so a session started after a break keeps the local time it starts at.
    pub(crate) async fn shown(
        &self,
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    ) -> Result<(), LibraryError> {
        self.tell(Report::Shown {
            book,
            page,
            utc_offset,
        })
        .await
    }

    pub(crate) async fn closed(&self, book: BookId) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Closed { book, saved }).await
    }

    pub(crate) async fn save_now(&self) -> Result<(), LibraryError> {
        self.ask(|saved| Report::SaveNow { saved }).await
    }

    /// Saves at once and ends the reading session, so the time the app spends put away never counts as reading.
    pub(crate) async fn put_away(&self) -> Result<(), LibraryError> {
        self.ask(|saved| Report::PutAway { saved }).await
    }

    /// Saves whatever reading reached, answering with the page reached in `book` still unsaved should the save fail.
    pub(crate) async fn save_before_opening(
        &self,
        book: BookId,
    ) -> Result<Option<ReachedPage>, LibraryError> {
        let (unsaved, answered) = oneshot::channel();
        self.tell(Report::SaveBeforeOpening { book, unsaved })
            .await?;
        answered.await.map_err(|_| LibraryError::ReadingStopped)
    }

    async fn tell(&self, report: Report) -> Result<(), LibraryError> {
        self.reports
            .send(report)
            .await
            .map_err(|_| LibraryError::ReadingStopped)
    }

    async fn ask(&self, report: impl FnOnce(Saved) -> Report) -> Result<(), LibraryError> {
        let (saved, outcome) = oneshot::channel();
        self.tell(report(saved)).await?;
        outcome
            .await
            .map_err(|_| LibraryError::ReadingStopped)?
            .map_err(LibraryError::from)
    }
}

async fn keep(mut keeper: Keeper, mut reports: mpsc::Receiver<Report>) {
    loop {
        let due = keeper.due();
        let report = tokio::select! {
            report = reports.recv() => report,
            () = wait_until(due) => {
                answer(None, keeper.save().await);
                continue;
            }
        };
        let Some(report) = report else {
            answer(None, keeper.save().await);
            return;
        };
        keeper.hear(report).await;
    }
}

/// Reads the book the reader restored last, whatever order the opens of other books finish in.
struct Keeper {
    store: Arc<Store>,
    session: Option<ReadingSession>,
    page_counts: HashMap<BookId, usize>,
    /// The page reached in each book left before its save landed, which every save tries again.
    left_unsaved: HashMap<BookId, ReachedPage>,
    retry_at: Option<Instant>,
    failed_in_a_row: u32,
    saved: broadcast::Sender<ReadingSaved>,
}

impl Keeper {
    fn new(store: Arc<Store>, saved: broadcast::Sender<ReadingSaved>) -> Self {
        Self {
            store,
            session: None,
            page_counts: HashMap::new(),
            left_unsaved: HashMap::new(),
            retry_at: None,
            failed_in_a_row: 0,
            saved,
        }
    }

    /// When the next save is due, or nothing while every page reached is saved.
    fn due(&self) -> Option<Instant> {
        let session_due = self.session.as_ref().and_then(ReadingSession::save_at);
        session_due.into_iter().chain(self.retry_at).min()
    }

    async fn hear(&mut self, report: Report) {
        match report {
            Report::Opened {
                book,
                page_count,
                saved,
            } => {
                self.page_counts.insert(book, page_count);
                answer(Some(saved), self.save().await);
            }
            Report::Restored {
                book,
                page,
                utc_offset,
                saved,
            } => answer(Some(saved), self.restored(book, page, utc_offset).await),
            Report::Shown {
                book,
                page,
                utc_offset,
            } => {
                if let Some(open) = self.reading(book) {
                    open.moved_to(utc_offset);
                    open.shown(page, Instant::now());
                }
            }
            Report::Closed { book, saved } => answer(Some(saved), self.closed(book).await),
            Report::SaveNow { saved } => answer(Some(saved), self.save().await),
            Report::PutAway { saved } => answer(Some(saved), self.stop_reading().await),
            Report::SaveBeforeOpening { book, unsaved } => {
                answer(None, self.save().await);
                answer(Some(unsaved), self.unsaved_in(book));
            }
        }
    }

    /// The page reached in `book`, read now or left before, that no save has landed yet.
    fn unsaved_in(&self, book: BookId) -> Option<ReachedPage> {
        self.session
            .as_ref()
            .filter(|open| open.book() == book)
            .and_then(ReadingSession::unsaved)
            .or_else(|| self.left_unsaved.get(&book).copied())
    }

    /// Saves the book read before and reads `book` from now on, unless it is the book read already, failing only when its session can't be recorded.
    async fn restored(
        &mut self,
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    ) -> Result<(), Error> {
        let page_count = self.page_counts.remove(&book);
        if let Some(open) = self.session.as_mut().filter(|open| open.book() == book) {
            open.restored(page);
            return Ok(());
        }
        let Some(page_count) = page_count else {
            tracing::debug!(%book, "ignore a restore of a book never opened");
            return Ok(());
        };
        if self.session.is_some() {
            answer(None, self.save().await);
        }
        if let Some(left) = self.session.take() {
            self.leave(left);
        }
        let left = self.left_unsaved.get(&book).map(|left| left.page);
        self.session = ReadingSession::opening(book, page_count, utc_offset).map(|mut opening| {
            opening.restored(page);
            if let Some(left) = left {
                opening.restored_over(left, Instant::now());
            }
            opening
        });
        answer(None, self.save().await);
        self.record_reading().await
    }

    /// Stops reading `book` and saves the page reached in it, which later saves try again should this one fail.
    async fn closed(&mut self, book: BookId) -> Result<(), Error> {
        self.page_counts.remove(&book);
        if !self
            .session
            .as_ref()
            .is_some_and(|open| open.book() == book)
        {
            tracing::debug!(%book, "ignore closing a book not read now");
            return Ok(());
        }
        let saved = self.stop_reading().await;
        if let Some(left) = self.session.take() {
            self.leave(left);
        }
        saved
    }

    fn leave(&mut self, left: ReadingSession) {
        if let Some(reached) = left.unsaved() {
            self.left_unsaved.insert(reached.book, reached);
        }
    }

    /// Saves the page shown last and ends the reading session at this moment.
    async fn stop_reading(&mut self) -> Result<(), Error> {
        let saved = self.save().await;
        let Some(open) = self.session.as_mut() else {
            return saved;
        };
        let (book, continuity) = (open.book(), open.continuity());
        open.put_away();
        let stopped = self
            .store
            .write(move |writer| writer.record_reading_stopped(book.0, continuity))
            .await;
        saved.and(stopped)
    }

    /// Records the reading session going on in the book read now, from the page it stands on.
    async fn record_reading(&mut self) -> Result<(), Error> {
        let Some(open) = self.session.as_mut() else {
            return Ok(());
        };
        let Some(reached) = open.on_page() else {
            return Ok(());
        };
        let (place, continuity) = (reached.place(), open.continuity());
        let outcome = self
            .store
            .write(move |writer| writer.record_reading(&place, continuity))
            .await;
        if outcome.is_ok() {
            open.recorded();
        }
        outcome
    }

    /// The session of `book`, or nothing for a report about a book not read now.
    fn reading(&mut self, book: BookId) -> Option<&mut ReadingSession> {
        let open = self.session.as_mut().filter(|open| open.book() == book);
        if open.is_none() {
            tracing::debug!(%book, "ignore a report about a book not read now");
        }
        open
    }

    #[tracing::instrument(skip_all)]
    async fn save(&mut self) -> Result<(), Error> {
        let reading = self
            .session
            .as_ref()
            .and_then(|open| Some((open.unsaved()?, open.continuity())));
        let reached: Vec<ReachedPage> = self
            .left_unsaved
            .values()
            .copied()
            .chain(reading.map(|(reached, _)| reached))
            .collect();
        if reached.is_empty() {
            self.end_failed_run();
            return Ok(());
        }
        let outcome = self
            .store
            .write(move |writer| {
                let told = write_reached(writer, &reached)?;
                if let Some((reading, continuity)) = reading {
                    writer.record_reading(&reading.place(), continuity)?;
                }
                Ok(told)
            })
            .await;
        match outcome {
            Ok(told) => {
                self.landed(&told, reading.map(|(reached, _)| reached));
                Ok(())
            }
            Err(error) => {
                self.failed(&error);
                Err(error)
            }
        }
    }

    fn landed(&mut self, told: &[ReadingSaved], reading: Option<ReachedPage>) {
        self.left_unsaved.clear();
        self.end_failed_run();
        if let (Some(open), Some(reading)) = (self.session.as_mut(), reading) {
            open.saved(reading);
            open.recorded();
        }
        for &saved in told {
            if self.saved.send(saved).is_err() {
                tracing::trace!("no one is listening for reading saved");
            }
        }
    }

    fn end_failed_run(&mut self) {
        self.retry_at = None;
        self.failed_in_a_row = 0;
    }

    /// Tries again twice as long after each failure in a row, warning only of the first.
    fn failed(&mut self, error: &Error) {
        if self.failed_in_a_row == 0 {
            tracing::warn!(error = %describe_error(error), "save the page reading reached, trying again until it saves");
        } else {
            tracing::debug!(error = %describe_error(error), failed_in_a_row = self.failed_in_a_row, "save the page reading reached again");
        }
        let wait = READING_SAVE_DELAY
            .saturating_mul(2_u32.saturating_pow(self.failed_in_a_row))
            .min(LONGEST_RETRY_WAIT);
        self.failed_in_a_row = self.failed_in_a_row.saturating_add(1);
        let retry_at = Instant::now() + wait;
        self.retry_at = Some(retry_at);
        if let Some(open) = self.session.as_mut() {
            open.save_failed(retry_at);
        }
    }
}

/// Writes the pages in order, so a later page reached in a book overrides an earlier one, and tells of each book written that is in the catalog.
fn write_reached(
    writer: &mut Writer<'_>,
    reached: &[ReachedPage],
) -> Result<Vec<ReadingSaved>, Error> {
    let mut told: Vec<ReadingSaved> = Vec::new();
    for reached in reached {
        let ReachedPage { book, page, .. } = *reached;
        writer.set_position(book.0, page)?;
        writer.raise_furthest(book.0, page)?;
        if reached.is_last() {
            writer.set_read(book.0, true)?;
        } else if writer.is_read(book.0)? {
            writer.set_read(book.0, false)?;
        }
        if told.iter().any(|saved| saved.book == book) {
            continue;
        }
        if let Some(series) = writer.series_of(book.0)? {
            told.push(ReadingSaved {
                book,
                series: SeriesId(series),
            });
        }
    }
    Ok(told)
}

async fn wait_until(due: Option<Instant>) {
    match due {
        Some(due) => sleep_until(due).await,
        None => future::pending().await,
    }
}

/// Hands the outcome to whoever asked for the save, the save itself having logged any failure.
fn answer<T>(asker: Option<oneshot::Sender<T>>, outcome: T) {
    if let Some(asker) = asker
        && asker.send(outcome).is_err()
    {
        tracing::debug!("a save finished after its asker stopped waiting");
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use omnileaf_db::{Config, Database, store::reading_state};
    use omnileaf_testkit::ScratchFolder;
    use tokio::time::Duration;

    use super::*;
    use crate::{
        Clock, SystemClock, captured_log::CapturedLog, library_book::sample_book_id as book,
    };

    const PAGE_COUNT: usize = 8;
    const LAST_PAGE: u32 = 7;
    const LONGER_THAN_A_BREAK_MS: u64 = 3 * 60_000;
    const REFUSE_SAVES: &str = "CREATE TRIGGER refuse_saves BEFORE INSERT ON sync_register
        BEGIN SELECT RAISE(ABORT, 'saves refused'); END";

    #[derive(Clone)]
    struct SteppedClock(Arc<AtomicU64>);

    impl SteppedClock {
        fn advance(&self, ms: u64) {
            self.0.fetch_add(ms, Ordering::Relaxed);
        }
    }

    impl Clock for SteppedClock {
        fn now_unix_ms(&self) -> u64 {
            self.0.load(Ordering::Relaxed)
        }
    }

    fn keeper(folder: &ScratchFolder) -> Keeper {
        keeper_on(folder, SystemClock)
    }

    fn keeper_on(folder: &ScratchFolder, clock: impl Clock) -> Keeper {
        let database = Database::open(&Config {
            path: folder.path().join("library.sqlite"),
            backup_dir: folder.path().join("backups"),
            mmap_size_bytes: 0,
        })
        .unwrap();
        Keeper::new(
            Arc::new(Store::new(database, clock)),
            broadcast::Sender::new(SAVED_BACKLOG),
        )
    }

    async fn open(keeper: &mut Keeper, book: BookId) {
        let (saved, _) = oneshot::channel();
        keeper
            .hear(Report::Opened {
                book,
                page_count: PAGE_COUNT,
                saved,
            })
            .await;
    }

    /// Opens and restores the book on its first page, then shows `page`.
    async fn read(keeper: &mut Keeper, book: BookId, page: u32) {
        open(keeper, book).await;
        restore(keeper, book, 0).await;
        keeper
            .hear(Report::Shown {
                book,
                page,
                utc_offset: UtcOffset::UTC,
            })
            .await;
    }

    async fn restore(keeper: &mut Keeper, book: BookId, page: u32) {
        let (saved, _) = oneshot::channel();
        keeper
            .hear(Report::Restored {
                book,
                page,
                utc_offset: UtcOffset::UTC,
                saved,
            })
            .await;
    }

    async fn show(keeper: &mut Keeper, book: BookId, page: u32) {
        keeper
            .hear(Report::Shown {
                book,
                page,
                utc_offset: UtcOffset::UTC,
            })
            .await;
    }

    async fn put_away(keeper: &mut Keeper) {
        let (saved, _) = oneshot::channel();
        keeper.hear(Report::PutAway { saved }).await;
    }

    async fn refuse_saves(keeper: &Keeper) {
        keeper
            .store
            .database()
            .write(|transaction| Ok(transaction.execute_batch(REFUSE_SAVES)?))
            .await
            .unwrap();
    }

    async fn allow_saves(keeper: &Keeper) {
        keeper
            .store
            .database()
            .write(|transaction| Ok(transaction.execute_batch("DROP TRIGGER refuse_saves")?))
            .await
            .unwrap();
    }

    async fn position(keeper: &Keeper, book: BookId) -> Option<u32> {
        let state = keeper
            .store
            .database()
            .read(move |connection| reading_state(connection, book.0))
            .await
            .unwrap();
        state.and_then(|state| state.position_page)
    }

    #[tokio::test(start_paused = true)]
    async fn keeps_the_page_reached_in_a_book_left_for_another_while_saves_fail_and_saves_it_later()
    {
        let folder = ScratchFolder::new("progress-left-unsaved");
        let mut keeper = keeper(&folder);
        read(&mut keeper, book(1), 3).await;
        refuse_saves(&keeper).await;
        read(&mut keeper, book(2), 0).await;
        allow_saves(&keeper).await;

        keeper.save().await.unwrap();

        assert_eq!(position(&keeper, book(1)).await, Some(3));
    }

    #[tokio::test(start_paused = true)]
    async fn saves_the_page_a_book_is_reopened_on_over_the_page_left_unsaved_in_it() {
        let folder = ScratchFolder::new("progress-reopened-over-left-unsaved");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        read(&mut keeper, book(2), 0).await;
        open(&mut keeper, book(1)).await;
        restore(&mut keeper, book(1), 1).await;
        allow_saves(&keeper).await;

        keeper.save().await.unwrap();

        let state = keeper
            .store
            .database()
            .read(|connection| reading_state(connection, book(1).0))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (state.position_page, state.furthest_page),
            (Some(1), Some(3))
        );
    }

    async fn sessions(keeper: &Keeper) -> Vec<(Vec<u8>, u32)> {
        keeper
            .store
            .database()
            .read(|connection| {
                let mut listed =
                    connection.prepare("SELECT book_id, page FROM reading_session ORDER BY id")?;
                let rows = listed.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
                Ok(rows.collect::<Result<Vec<_>, _>>()?)
            })
            .await
            .unwrap()
    }

    fn session_of(book: BookId, page: u32) -> (Vec<u8>, u32) {
        (book.0.as_bytes().to_vec(), page)
    }

    #[tokio::test(start_paused = true)]
    async fn records_no_session_for_the_page_left_unsaved_in_a_book_once_it_saves_later() {
        let folder = ScratchFolder::new("progress-left-unsaved-sessions");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        read(&mut keeper, book(2), 0).await;
        allow_saves(&keeper).await;

        keeper.save().await.unwrap();

        assert_eq!(
            sessions(&keeper).await,
            [session_of(book(1), 0), session_of(book(2), 0)]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn records_one_new_session_for_a_book_reopened_over_the_page_left_unsaved_in_it() {
        let folder = ScratchFolder::new("progress-reopened-sessions");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        read(&mut keeper, book(2), 0).await;
        open(&mut keeper, book(1)).await;
        restore(&mut keeper, book(1), 1).await;
        allow_saves(&keeper).await;

        keeper.save().await.unwrap();

        assert_eq!(
            sessions(&keeper).await,
            [
                session_of(book(1), 0),
                session_of(book(2), 0),
                session_of(book(1), 1)
            ]
        );
    }

    fn put_away_clock() -> SteppedClock {
        SteppedClock(Arc::new(AtomicU64::new(1_790_000_000_000)))
    }

    #[tokio::test(start_paused = true)]
    async fn records_a_new_session_for_reading_on_long_after_a_put_away_whose_save_failed() {
        let folder = ScratchFolder::new("progress-put-away-unsaved");
        let clock = put_away_clock();
        let mut keeper = keeper_on(&folder, clock.clone());
        read(&mut keeper, book(1), 3).await;
        refuse_saves(&keeper).await;
        put_away(&mut keeper).await;
        allow_saves(&keeper).await;
        clock.advance(LONGER_THAN_A_BREAK_MS);
        show(&mut keeper, book(1), 4).await;

        keeper.save().await.unwrap();

        assert_eq!(
            sessions(&keeper).await,
            [session_of(book(1), 0), session_of(book(1), 4)]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn records_a_new_session_for_reading_on_long_after_a_put_away_whose_save_landed_later() {
        let folder = ScratchFolder::new("progress-put-away-saved-later");
        let clock = put_away_clock();
        let mut keeper = keeper_on(&folder, clock.clone());
        read(&mut keeper, book(1), 3).await;
        refuse_saves(&keeper).await;
        put_away(&mut keeper).await;
        allow_saves(&keeper).await;
        keeper.save().await.unwrap();
        clock.advance(LONGER_THAN_A_BREAK_MS);
        show(&mut keeper, book(1), 4).await;

        keeper.save().await.unwrap();

        assert_eq!(
            sessions(&keeper).await,
            [session_of(book(1), 3), session_of(book(1), 4)]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn marks_each_book_read_or_unread_by_the_later_of_its_pages_saved_together() {
        let folder = ScratchFolder::new("progress-read-by-later-page");
        let keeper = keeper(&folder);
        let reached = |book, page| ReachedPage {
            book,
            page,
            page_count: LAST_PAGE + 1,
            utc_offset: UtcOffset::UTC,
        };
        let pages = [
            reached(book(1), LAST_PAGE),
            reached(book(1), 3),
            reached(book(2), 3),
            reached(book(2), LAST_PAGE),
        ];

        keeper
            .store
            .write(move |writer| write_reached(writer, &pages))
            .await
            .unwrap();

        let read = keeper
            .store
            .database()
            .read(|connection| {
                [book(1), book(2)]
                    .map(|book| reading_state(connection, book.0))
                    .into_iter()
                    .map(|state| Ok(state?.and_then(|state| state.is_read)))
                    .collect::<Result<Vec<_>, Error>>()
            })
            .await
            .unwrap();
        assert_eq!(read, [Some(false), Some(true)]);
    }

    #[tokio::test(start_paused = true)]
    async fn waits_twice_as_long_after_each_save_that_fails_up_to_a_minute() {
        let folder = ScratchFolder::new("progress-backs-off");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;

        let mut waits = Vec::new();
        for _ in 0..8 {
            keeper.save().await.unwrap_err();
            waits.push(keeper.due().unwrap() - Instant::now());
        }

        let expected = [1_500, 3_000, 6_000, 12_000, 24_000, 48_000, 60_000, 60_000]
            .map(Duration::from_millis);
        assert_eq!(waits, expected);
    }

    #[tokio::test(start_paused = true)]
    async fn waits_a_moment_again_once_a_save_lands_after_some_failed() {
        let folder = ScratchFolder::new("progress-backs-off-again");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        keeper.save().await.unwrap_err();
        keeper.save().await.unwrap_err();
        allow_saves(&keeper).await;
        keeper.save().await.unwrap();
        refuse_saves(&keeper).await;
        keeper
            .hear(Report::Shown {
                book: book(1),
                page: 4,
                utc_offset: UtcOffset::UTC,
            })
            .await;

        keeper.save().await.unwrap_err();

        assert_eq!(
            keeper.due().map(|due| due - Instant::now()),
            Some(READING_SAVE_DELAY)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn waits_for_nothing_once_the_reader_turns_back_to_the_saved_page_after_a_save_failed() {
        let folder = ScratchFolder::new("progress-backs-off-nothing-unsaved");
        let mut keeper = keeper(&folder);
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        keeper.save().await.unwrap_err();
        keeper
            .hear(Report::Shown {
                book: book(1),
                page: 0,
                utc_offset: UtcOffset::UTC,
            })
            .await;

        keeper.save().await.unwrap();

        assert_eq!(keeper.due(), None);
    }

    #[tokio::test(start_paused = true)]
    async fn warns_once_for_each_run_of_saves_that_fail() {
        let folder = ScratchFolder::new("progress-warns-once");
        let mut keeper = keeper(&folder);
        let log = CapturedLog::default();
        let _logging = tracing::subscriber::set_default(log.subscriber());
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;

        for _ in 0..3 {
            keeper.save().await.unwrap_err();
        }
        allow_saves(&keeper).await;
        keeper.save().await.unwrap();
        refuse_saves(&keeper).await;
        keeper
            .hear(Report::Shown {
                book: book(1),
                page: 4,
                utc_offset: UtcOffset::UTC,
            })
            .await;
        keeper.save().await.unwrap_err();

        assert_eq!(
            log.text().matches(" WARN ").count(),
            2,
            "log: {}",
            log.text()
        );
    }

    #[tokio::test(start_paused = true)]
    async fn warns_again_for_saves_that_fail_after_the_reader_turned_back_to_the_saved_page() {
        let folder = ScratchFolder::new("progress-warns-after-nothing-unsaved");
        let mut keeper = keeper(&folder);
        let log = CapturedLog::default();
        let _logging = tracing::subscriber::set_default(log.subscriber());
        refuse_saves(&keeper).await;
        read(&mut keeper, book(1), 3).await;
        keeper.save().await.unwrap_err();
        keeper
            .hear(Report::Shown {
                book: book(1),
                page: 0,
                utc_offset: UtcOffset::UTC,
            })
            .await;
        keeper.save().await.unwrap();
        keeper
            .hear(Report::Shown {
                book: book(1),
                page: 4,
                utc_offset: UtcOffset::UTC,
            })
            .await;

        keeper.save().await.unwrap_err();

        assert_eq!(
            keeper.due().map(|due| due - Instant::now()),
            Some(READING_SAVE_DELAY)
        );
        assert_eq!(
            log.text().matches(" WARN ").count(),
            2,
            "log: {}",
            log.text()
        );
    }

    #[tokio::test(start_paused = true)]
    async fn forgets_a_book_s_length_once_the_reader_restores_or_closes_it() {
        let folder = ScratchFolder::new("progress-forgets-lengths");
        let mut keeper = keeper(&folder);
        open(&mut keeper, book(1)).await;
        open(&mut keeper, book(2)).await;

        restore(&mut keeper, book(1), 0).await;
        let (saved, _) = oneshot::channel();
        keeper
            .hear(Report::Closed {
                book: book(2),
                saved,
            })
            .await;

        assert!(
            keeper.page_counts.is_empty(),
            "kept {:?}",
            keeper.page_counts
        );
    }
}
