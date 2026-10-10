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
    BookId, LibraryError, SeriesId, describe_error,
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

/// A book opened, which a session starts from once the reader restores it.
#[derive(Clone, Copy, Debug)]
struct Opened {
    series: SeriesId,
    page_count: usize,
}

enum Report {
    Opened {
        book: BookId,
        opened: Opened,
        saved: Saved,
    },
    Restored {
        book: BookId,
        page: u32,
    },
    Shown {
        book: BookId,
        page: u32,
    },
    Closed {
        book: BookId,
        saved: Saved,
    },
    SaveNow {
        saved: Saved,
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

    /// Saves the page reached in the book read now, and keeps `book`'s series and length for when the reader restores it.
    pub(crate) async fn opened(
        &self,
        book: BookId,
        series: SeriesId,
        page_count: usize,
    ) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Opened {
            book,
            opened: Opened { series, page_count },
            saved,
        })
        .await
    }

    /// Saves the page reached in the book read before, and saves from now on the pages shown in `book`.
    pub(crate) async fn restored(&self, book: BookId, page: u32) -> Result<(), LibraryError> {
        self.tell(Report::Restored { book, page }).await
    }

    pub(crate) async fn shown(&self, book: BookId, page: u32) -> Result<(), LibraryError> {
        self.tell(Report::Shown { book, page }).await
    }

    pub(crate) async fn closed(&self, book: BookId) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Closed { book, saved }).await
    }

    pub(crate) async fn save_now(&self) -> Result<(), LibraryError> {
        self.ask(|saved| Report::SaveNow { saved }).await
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
    opened: HashMap<BookId, Opened>,
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
            opened: HashMap::new(),
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
                opened,
                saved,
            } => {
                self.opened.insert(book, opened);
                answer(Some(saved), self.save().await);
            }
            Report::Restored { book, page } => self.restored(book, page).await,
            Report::Shown { book, page } => {
                if let Some(open) = self.reading(book) {
                    open.shown(page, Instant::now());
                }
            }
            Report::Closed { book, saved } => answer(Some(saved), self.closed(book).await),
            Report::SaveNow { saved } => answer(Some(saved), self.save().await),
        }
    }

    /// Saves the book read before and reads `book` from now on, unless it is the book read already.
    async fn restored(&mut self, book: BookId, page: u32) {
        let opened = self.opened.remove(&book);
        if let Some(open) = self.session.as_mut().filter(|open| open.book() == book) {
            open.restored(page);
            return;
        }
        let Some(Opened { series, page_count }) = opened else {
            tracing::debug!(%book, "ignore a restore of a book never opened");
            return;
        };
        if let Some(left) = self.session.take() {
            self.leave(left);
        }
        self.session = ReadingSession::opening(book, series, page_count).map(|mut opening| {
            opening.restored(page);
            opening
        });
        answer(None, self.save().await);
    }

    /// Stops reading `book` and saves the page reached in it, which later saves try again should this one fail.
    async fn closed(&mut self, book: BookId) -> Result<(), Error> {
        self.opened.remove(&book);
        let Some(left) = self.session.take_if(|open| open.book() == book) else {
            tracing::debug!(%book, "ignore closing a book not read now");
            return Ok(());
        };
        self.leave(left);
        self.save().await
    }

    fn leave(&mut self, left: ReadingSession) {
        if let Some(reached) = left.unsaved() {
            self.left_unsaved.insert(reached.book, reached);
        }
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
        let reading = self.session.as_ref().and_then(ReadingSession::unsaved);
        let reached: Vec<ReachedPage> =
            self.left_unsaved.values().copied().chain(reading).collect();
        if reached.is_empty() {
            return Ok(());
        }
        let outcome = self
            .store
            .write({
                let reached = reached.clone();
                move |writer| write_reached(writer, &reached)
            })
            .await;
        match &outcome {
            Ok(()) => self.landed(&reached, reading),
            Err(error) => self.failed(error),
        }
        outcome
    }

    fn landed(&mut self, reached: &[ReachedPage], reading: Option<ReachedPage>) {
        self.left_unsaved.clear();
        self.retry_at = None;
        self.failed_in_a_row = 0;
        if let (Some(open), Some(reading)) = (self.session.as_mut(), reading) {
            open.saved(reading);
        }
        for &ReachedPage { book, series, .. } in reached {
            if self.saved.send(ReadingSaved { book, series }).is_err() {
                tracing::trace!("no one is listening for reading saved");
            }
        }
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

/// Writes the pages in order, so a later page reached in a book overrides an earlier one.
fn write_reached(writer: &mut Writer<'_>, reached: &[ReachedPage]) -> Result<(), Error> {
    for &ReachedPage {
        book,
        page,
        is_last,
        ..
    } in reached
    {
        writer.set_position(book.0, page)?;
        writer.raise_furthest(book.0, page)?;
        if is_last {
            writer.set_read(book.0, true)?;
        }
    }
    Ok(())
}

async fn wait_until(due: Option<Instant>) {
    match due {
        Some(due) => sleep_until(due).await,
        None => future::pending().await,
    }
}

/// Hands the outcome to whoever asked for the save, the save itself having logged any failure.
fn answer(asker: Option<Saved>, outcome: Result<(), Error>) {
    if let Some(asker) = asker
        && asker.send(outcome).is_err()
    {
        tracing::debug!("a save finished after its asker stopped waiting");
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_db::{Config, Database, store::reading_state};
    use omnileaf_testkit::ScratchFolder;
    use tokio::time::Duration;

    use super::*;
    use crate::{
        SystemClock, captured_log::CapturedLog, library_book::sample_book_id as book,
        library_series::sample_series_id,
    };

    const PAGE_COUNT: usize = 8;
    const REFUSE_SAVES: &str = "CREATE TRIGGER refuse_saves BEFORE INSERT ON sync_register
        BEGIN SELECT RAISE(ABORT, 'saves refused'); END";

    fn keeper(folder: &ScratchFolder) -> Keeper {
        let database = Database::open(&Config {
            path: folder.path().join("library.sqlite"),
            backup_dir: folder.path().join("backups"),
            mmap_size_bytes: 0,
        })
        .unwrap();
        Keeper::new(
            Arc::new(Store::new(database, SystemClock)),
            broadcast::Sender::new(SAVED_BACKLOG),
        )
    }

    async fn open(keeper: &mut Keeper, book: BookId) {
        let (saved, _) = oneshot::channel();
        keeper
            .hear(Report::Opened {
                book,
                opened: Opened {
                    series: sample_series_id(),
                    page_count: PAGE_COUNT,
                },
                saved,
            })
            .await;
    }

    /// Opens and restores the book on its first page, then shows `page`.
    async fn read(keeper: &mut Keeper, book: BookId, page: u32) {
        open(keeper, book).await;
        keeper.hear(Report::Restored { book, page: 0 }).await;
        keeper.hear(Report::Shown { book, page }).await;
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
            })
            .await;

        keeper.save().await.unwrap_err();

        assert_eq!(
            keeper.due().map(|due| due - Instant::now()),
            Some(READING_SAVE_DELAY)
        );
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
    async fn forgets_a_book_s_length_once_the_reader_restores_or_closes_it() {
        let folder = ScratchFolder::new("progress-forgets-lengths");
        let mut keeper = keeper(&folder);
        open(&mut keeper, book(1)).await;
        open(&mut keeper, book(2)).await;

        keeper
            .hear(Report::Restored {
                book: book(1),
                page: 0,
            })
            .await;
        let (saved, _) = oneshot::channel();
        keeper
            .hear(Report::Closed {
                book: book(2),
                saved,
            })
            .await;

        assert!(keeper.opened.is_empty(), "kept {:?}", keeper.opened);
    }
}
