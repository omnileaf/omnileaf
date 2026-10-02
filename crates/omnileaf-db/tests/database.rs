#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch database, so a failed set-up should stop the test"
)]

mod support;

use std::{
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};

use omnileaf_db::{Connection, Database, Error, rusqlite};
use support::{MMAP_SIZE_BYTES, ScratchFolder};

const NORMAL_SYNCHRONOUS: i64 = 1;
const BUSY_TIMEOUT_MS: i64 = 5000;

#[tokio::test]
async fn configures_the_writer_for_write_ahead_logging_and_normal_sync() {
    let folder = ScratchFolder::new("writer-settings");
    let database = Database::open(&folder.config()).unwrap();

    let settings = database
        .write(|transaction| {
            let mode: String =
                transaction.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
            Ok((
                mode,
                pragma(transaction, "synchronous")?,
                pragma(transaction, "foreign_keys")?,
                pragma(transaction, "busy_timeout")?,
                pragma(transaction, "mmap_size")?,
            ))
        })
        .await
        .unwrap();

    assert_eq!(
        settings,
        (
            "wal".to_owned(),
            NORMAL_SYNCHRONOUS,
            1,
            BUSY_TIMEOUT_MS,
            i64::from(MMAP_SIZE_BYTES)
        )
    );
}

#[tokio::test]
async fn configures_readers_with_foreign_keys_the_busy_timeout_and_memory_mapping() {
    let folder = ScratchFolder::new("reader-settings");
    let database = Database::open(&folder.config()).unwrap();

    let settings = database
        .read(|connection| {
            Ok((
                pragma(connection, "foreign_keys")?,
                pragma(connection, "busy_timeout")?,
                pragma(connection, "mmap_size")?,
            ))
        })
        .await
        .unwrap();

    assert_eq!(settings, (1, BUSY_TIMEOUT_MS, i64::from(MMAP_SIZE_BYTES)));
}

#[tokio::test]
async fn readers_refuse_to_write() {
    let folder = ScratchFolder::new("read-only");
    let database = Database::open(&folder.config()).unwrap();
    create_notes(&database).await;

    let outcome = database
        .read(|connection| Ok(connection.execute("INSERT INTO note (body) VALUES ('kept')", [])?))
        .await;

    assert!(matches!(
        outcome,
        Err(Error::Statement(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error {
                code: rusqlite::ErrorCode::ReadOnly,
                ..
            },
            _
        )))
    ));
}

#[tokio::test]
async fn runs_three_reads_at_the_same_time() {
    let folder = ScratchFolder::new("read-pool");
    let database = Database::open(&folder.config()).unwrap();
    let meeting = Arc::new(Meeting::default());

    let reads: Vec<_> = (0..3)
        .map(|_| {
            let meeting = Arc::clone(&meeting);
            database.read(move |_| Ok(meeting.arrive_and_wait_for(3)))
        })
        .collect();
    let mut all_met = Vec::new();
    for read in reads {
        all_met.push(read.await.unwrap());
    }

    assert_eq!(all_met, [true, true, true]);
}

#[tokio::test]
async fn runs_writes_in_the_order_they_were_submitted() {
    let folder = ScratchFolder::new("write-order");
    let database = Database::open(&folder.config()).unwrap();
    create_notes(&database).await;
    let bodies = numbered_notes();

    let writes: Vec<_> = bodies
        .iter()
        .map(|body| add_note(&database, body.clone()))
        .collect();
    for write in writes {
        write.await.unwrap();
    }

    assert_eq!(note_bodies(&database).await, bodies);
}

#[tokio::test]
async fn keeps_nothing_from_a_write_job_that_fails() {
    let folder = ScratchFolder::new("rollback");
    let database = Database::open(&folder.config()).unwrap();
    create_notes(&database).await;

    let outcome = database
        .write(|transaction| {
            transaction.execute("INSERT INTO note (body) VALUES ('dropped')", [])?;
            transaction.execute("INSERT INTO note (body) VALUES (NULL)", [])?;
            Ok(())
        })
        .await;

    assert!(matches!(outcome, Err(Error::Statement(_))));
    assert!(note_bodies(&database).await.is_empty());
}

#[tokio::test]
async fn keeps_writing_after_a_write_job_panics() {
    let folder = ScratchFolder::new("panic");
    let database = Database::open(&folder.config()).unwrap();
    create_notes(&database).await;

    let panicked = database
        .write::<(), _>(|transaction| {
            transaction.execute("INSERT INTO note (body) VALUES ('dropped')", [])?;
            panic!("the job gave up")
        })
        .await;
    let later = add_note(&database, "kept".to_owned()).await;

    assert!(matches!(panicked, Err(Error::JobPanicked)));
    assert!(later.is_ok());
    assert_eq!(note_bodies(&database).await, ["kept"]);
}

#[tokio::test]
async fn finishes_submitted_writes_before_closing() {
    let folder = ScratchFolder::new("close");
    let database = Database::open(&folder.config()).unwrap();
    create_notes(&database).await;
    let bodies = numbered_notes();

    let _unawaited: Vec<_> = bodies
        .iter()
        .map(|body| add_note(&database, body.clone()))
        .collect();
    drop(database);
    let reopened = Database::open(&folder.config()).unwrap();

    assert_eq!(note_bodies(&reopened).await, bodies);
}

#[tokio::test]
async fn leaves_no_write_ahead_log_behind_once_closed() {
    let folder = ScratchFolder::new("checkpoint");
    let config = folder.config();
    let database = Database::open(&config).unwrap();
    create_notes(&database).await;
    add_note(&database, "kept".to_owned()).await.unwrap();
    note_bodies(&database).await;

    drop(database);

    let mut write_ahead_log = config.path.into_os_string();
    write_ahead_log.push("-wal");
    assert!(!PathBuf::from(write_ahead_log).exists());
}

#[tokio::test]
async fn reports_which_database_could_not_be_opened() {
    let folder = ScratchFolder::new("missing-folder");
    let mut config = folder.config();
    config.path = config.path.with_file_name("missing").join("library.sqlite");

    let outcome = Database::open(&config);

    assert!(matches!(outcome, Err(Error::Open { path, .. }) if path == config.path));
}

#[test]
fn names_the_database_a_blocked_migration_was_for() {
    let folder = ScratchFolder::new("locked");
    let config = folder.config();
    let holder = rusqlite::Connection::open(&config.path).unwrap();
    holder
        .query_row("PRAGMA journal_mode = wal", [], |_| Ok(()))
        .unwrap();
    holder.execute_batch("BEGIN IMMEDIATE").unwrap();

    let outcome = Database::open(&config);

    assert!(matches!(outcome, Err(Error::Upgrade { path, .. }) if path == config.path));
}

#[tokio::test]
async fn stamps_a_new_database_as_an_omnileaf_library() {
    let folder = ScratchFolder::new("application-id");
    let database = Database::open(&folder.config()).unwrap();

    let application_id = database
        .read(|connection| pragma(connection, "application_id"))
        .await
        .unwrap();

    assert_eq!(application_id, i64::from(i32::from_be_bytes(*b"OMNL")));
}

#[tokio::test]
async fn refuses_a_database_from_a_newer_build() {
    let folder = ScratchFolder::new("newer-schema");
    let database = Database::open(&folder.config()).unwrap();
    database
        .write(|transaction| Ok(transaction.pragma_update(None, "user_version", 9999)?))
        .await
        .unwrap();
    drop(database);

    let outcome = Database::open(&folder.config());

    assert!(matches!(
        outcome,
        Err(Error::NewerSchema { found: 9999, .. })
    ));
}

#[tokio::test]
async fn backs_up_neither_a_new_database_nor_a_current_one() {
    let folder = ScratchFolder::new("no-backup");
    let config = folder.config();

    drop(Database::open(&config).unwrap());
    drop(Database::open(&config).unwrap());

    assert!(!config.backup_dir.exists());
}

fn pragma(connection: &Connection, name: &str) -> Result<i64, Error> {
    Ok(connection.query_row(&format!("PRAGMA {name}"), [], |row| row.get(0))?)
}

fn numbered_notes() -> Vec<String> {
    (0..50).map(|index| format!("note {index}")).collect()
}

async fn create_notes(database: &Database) {
    database
        .write(|transaction| {
            Ok(transaction
                .execute_batch("CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT NOT NULL);")?)
        })
        .await
        .unwrap();
}

fn add_note(database: &Database, body: String) -> impl Future<Output = Result<(), Error>> + use<> {
    database.write(move |transaction| {
        transaction.execute("INSERT INTO note (body) VALUES (?1)", [body])?;
        Ok(())
    })
}

async fn note_bodies(database: &Database) -> Vec<String> {
    database
        .read(|connection| {
            let mut statement = connection.prepare("SELECT body FROM note ORDER BY id")?;
            let bodies = statement
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?;
            Ok(bodies)
        })
        .await
        .unwrap()
}

#[derive(Default)]
struct Meeting {
    arrived: Mutex<usize>,
    changed: Condvar,
}

impl Meeting {
    const PATIENCE: Duration = Duration::from_secs(5);

    fn arrive_and_wait_for(&self, expected: usize) -> bool {
        let mut arrived = self.arrived.lock().unwrap();
        *arrived += 1;
        self.changed.notify_all();
        let (_arrived, waited) = self
            .changed
            .wait_timeout_while(arrived, Self::PATIENCE, |arrived| *arrived < expected)
            .unwrap();
        !waited.timed_out()
    }
}
