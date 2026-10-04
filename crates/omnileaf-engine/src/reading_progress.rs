use std::{future, sync::Arc};

use omnileaf_db::{Error, store::Store};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::{Instant, sleep_until},
};

use crate::{
    BookId, LibraryError, describe_error,
    reading_session::{ReachedPage, ReadingSession},
};

const REPORT_BACKLOG: usize = 64;

type Saved = oneshot::Sender<Result<(), Error>>;

enum Report {
    Opened {
        book: BookId,
        page_count: usize,
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
    _task: JoinHandle<()>,
}

impl ReadingProgress {
    /// Starts the task that saves progress, which saves whatever is unsaved and stops once this is dropped.
    pub(crate) fn start(store: Arc<Store>) -> Self {
        let (reports, received) = mpsc::channel(REPORT_BACKLOG);
        Self {
            reports,
            _task: tokio::spawn(keep(store, received)),
        }
    }

    /// Saves the book read before, then saves nothing for this one until the reader restores it.
    pub(crate) async fn opened(&self, book: BookId, page_count: usize) -> Result<(), LibraryError> {
        self.ask(|saved| Report::Opened {
            book,
            page_count,
            saved,
        })
        .await
    }

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

async fn keep(store: Arc<Store>, mut reports: mpsc::Receiver<Report>) {
    let mut session = None;
    loop {
        let due = session.as_ref().and_then(ReadingSession::save_at);
        let report = tokio::select! {
            report = reports.recv() => report,
            () = wait_until(due) => {
                answer_or_warn(None, save(&store, &mut session).await);
                continue;
            }
        };
        let Some(report) = report else {
            answer_or_warn(None, save(&store, &mut session).await);
            return;
        };
        match report {
            Report::Opened {
                book,
                page_count,
                saved,
            } => {
                let outcome = save(&store, &mut session).await;
                session = ReadingSession::opening(book, page_count);
                answer_or_warn(Some(saved), outcome);
            }
            Report::Restored { book, page } => {
                if let Some(open) = reading(&mut session, book) {
                    open.restored(page);
                }
            }
            Report::Shown { book, page } => {
                if let Some(open) = reading(&mut session, book) {
                    open.shown(page, Instant::now());
                }
            }
            Report::Closed { book, saved } => {
                let outcome = match reading(&mut session, book) {
                    Some(_) => {
                        let outcome = save(&store, &mut session).await;
                        session = None;
                        outcome
                    }
                    None => Ok(()),
                };
                answer_or_warn(Some(saved), outcome);
            }
            Report::SaveNow { saved } => {
                answer_or_warn(Some(saved), save(&store, &mut session).await);
            }
        }
    }
}

/// The session of `book`, or nothing for a report about a book no longer open.
fn reading(session: &mut Option<ReadingSession>, book: BookId) -> Option<&mut ReadingSession> {
    let open = session.as_mut().filter(|open| open.book() == book);
    if open.is_none() {
        tracing::debug!(%book, "ignore a report about a book no longer open");
    }
    open
}

async fn wait_until(due: Option<Instant>) {
    match due {
        Some(due) => sleep_until(due).await,
        None => future::pending().await,
    }
}

#[tracing::instrument(skip_all)]
async fn save(store: &Store, session: &mut Option<ReadingSession>) -> Result<(), Error> {
    let Some(reached) = session.as_mut().and_then(ReadingSession::take_unsaved) else {
        return Ok(());
    };
    let ReachedPage {
        book,
        page,
        is_last,
    } = reached;
    store
        .write(move |writer| {
            writer.set_position(book.0, page)?;
            writer.raise_furthest(book.0, page)?;
            if is_last {
                writer.set_read(book.0, true)?;
            }
            Ok(())
        })
        .await
}

/// Hands the outcome to whoever asked for the save, or logs a failure no one asked about.
fn answer_or_warn(asker: Option<Saved>, outcome: Result<(), Error>) {
    match (asker, outcome) {
        (Some(asker), outcome) => {
            if asker.send(outcome).is_err() {
                tracing::debug!("a save finished after its asker stopped waiting");
            }
        }
        (None, Ok(())) => {}
        (None, Err(error)) => {
            tracing::warn!(error = %describe_error(&error), "save the page reading reached");
        }
    }
}
