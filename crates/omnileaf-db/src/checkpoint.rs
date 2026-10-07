//! Copies the write-ahead log back into the database file on a thread of its own, so no write waits for that copy or its flushes.

use std::{
    cell::Cell,
    ffi::c_int,
    sync::mpsc::{Receiver, SyncSender, TrySendError, sync_channel},
    thread::{self, JoinHandle},
};

use rusqlite::{Connection, hooks::Wal};

use crate::Error;

/// The log length SQLite checkpoints at by itself, kept so the log grows no longer than it would have.
const CHECKPOINT_DUE_AT_FRAMES: c_int = 1000;
const WAITING_REQUESTS: usize = 1;

thread_local! {
    static IS_CHECKPOINT_DUE: Cell<bool> = const { Cell::new(false) };
}

/// Dropping it blocks until every checkpoint already asked for has run.
pub(crate) struct Checkpointer {
    requests: Option<SyncSender<()>>,
    thread: Option<JoinHandle<()>>,
}

impl Checkpointer {
    pub(crate) fn spawn(connection: Connection) -> Result<Self, Error> {
        let (requests, requested) = sync_channel(WAITING_REQUESTS);
        let thread = thread::Builder::new()
            .name("omnileaf-db-checkpointer".to_owned())
            .spawn(move || serve(&connection, &requested))
            .map_err(Error::Spawn)?;
        Ok(Self {
            requests: Some(requests),
            thread: Some(thread),
        })
    }

    pub(crate) fn requests(&self) -> CheckpointRequests {
        CheckpointRequests(self.requests.clone())
    }
}

impl Drop for Checkpointer {
    fn drop(&mut self) {
        drop(self.requests.take());
        if self
            .thread
            .take()
            .is_some_and(|thread| thread.join().is_err())
        {
            tracing::error!("the checkpoint thread panicked");
        }
    }
}

#[derive(Clone)]
pub(crate) struct CheckpointRequests(Option<SyncSender<()>>);

impl CheckpointRequests {
    /// Asks for a checkpoint when the last commit on this thread left the log long enough to need one, folding it into one already waiting.
    pub(crate) fn request_if_due(&self) {
        if !IS_CHECKPOINT_DUE.replace(false) {
            return;
        }
        let Some(requests) = &self.0 else {
            return;
        };
        match requests.try_send(()) {
            Ok(()) | Err(TrySendError::Full(())) => {}
            Err(TrySendError::Disconnected(())) => {
                tracing::warn!(
                    "leave the write-ahead log long, since the checkpoint thread stopped"
                );
            }
        }
    }
}

/// Stops the connection checkpointing after its own commits, noting on the committing thread when the log is due for one instead.
pub(crate) fn hand_checkpoints_over(connection: &Connection) {
    connection.wal_hook(Some(note_log_length));
}

#[expect(
    clippy::unnecessary_wraps,
    reason = "SQLite's write-ahead log hook has to return a result"
)]
fn note_log_length(_: &Wal, frames: c_int) -> rusqlite::Result<()> {
    if frames >= CHECKPOINT_DUE_AT_FRAMES {
        IS_CHECKPOINT_DUE.set(true);
    }
    Ok(())
}

fn serve(connection: &Connection, requested: &Receiver<()>) {
    for () in requested {
        if let Err(error) = checkpoint(connection) {
            tracing::warn!(%error, "copy the write-ahead log back into the database file");
        }
    }
}

/// Copies what it can without waiting on readers or the writer, as SQLite's own checkpoints after a commit do.
fn checkpoint(connection: &Connection) -> rusqlite::Result<()> {
    connection.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()))
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::mpsc::sync_channel};

    use super::*;
    use crate::{connection, scratch::ScratchLibrary};

    const FILL_THE_LOG: &str = "CREATE TABLE filler (body BLOB NOT NULL);
        WITH RECURSIVE row (number) AS (SELECT 1 UNION ALL SELECT number + 1 FROM row WHERE number < 1200)
        INSERT INTO filler (body) SELECT zeroblob(4000) FROM row;";
    const ADD_A_ROW: &str = "CREATE TABLE filler (body BLOB NOT NULL);
        INSERT INTO filler (body) VALUES (zeroblob(10));";

    fn handed_over_writer(scratch: &ScratchLibrary) -> Connection {
        let writer = connection::open_writer(&scratch.config).unwrap();
        hand_checkpoints_over(&writer);
        writer
    }

    fn database_file_bytes(scratch: &ScratchLibrary) -> u64 {
        fs::metadata(&scratch.config.path).unwrap().len()
    }

    fn page_bytes(connection: &Connection) -> u64 {
        let pages: u64 = connection
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .unwrap();
        let page_size: u64 = connection
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .unwrap();
        pages * page_size
    }

    #[test]
    fn leaves_a_long_log_out_of_the_database_file_after_the_commit_that_made_it() {
        let scratch = ScratchLibrary::new("left-in-log");
        let writer = handed_over_writer(&scratch);
        let before = database_file_bytes(&scratch);

        writer.execute_batch(FILL_THE_LOG).unwrap();

        assert_eq!(database_file_bytes(&scratch), before);
    }

    #[test]
    fn asks_for_a_checkpoint_once_a_commit_leaves_the_log_due_for_one() {
        let scratch = ScratchLibrary::new("due");
        let writer = handed_over_writer(&scratch);
        let (sender, requested) = sync_channel(1);
        writer.execute_batch(FILL_THE_LOG).unwrap();

        CheckpointRequests(Some(sender)).request_if_due();

        assert_eq!(requested.try_recv(), Ok(()));
    }

    #[test]
    fn asks_for_no_checkpoint_while_the_log_is_short() {
        let scratch = ScratchLibrary::new("short");
        let writer = handed_over_writer(&scratch);
        let (sender, requested) = sync_channel(1);
        writer.execute_batch(ADD_A_ROW).unwrap();

        CheckpointRequests(Some(sender)).request_if_due();

        assert!(requested.try_recv().is_err());
    }

    #[test]
    fn copies_the_whole_log_into_the_database_file_when_asked() {
        let scratch = ScratchLibrary::new("copied");
        let writer = handed_over_writer(&scratch);
        writer.execute_batch(FILL_THE_LOG).unwrap();
        let checkpointer =
            Checkpointer::spawn(connection::open_writer(&scratch.config).unwrap()).unwrap();

        checkpointer.requests().request_if_due();
        drop(checkpointer);

        assert_eq!(database_file_bytes(&scratch), page_bytes(&writer));
    }
}
