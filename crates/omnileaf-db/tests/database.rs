#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch database, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{Connection, Database, Error};
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
async fn reports_which_database_could_not_be_opened() {
    let folder = ScratchFolder::new("missing-folder");
    let mut config = folder.config();
    config.path = config.path.with_file_name("missing").join("library.sqlite");

    let outcome = Database::open(&config);

    assert!(matches!(outcome, Err(Error::Open { path, .. }) if path == config.path));
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
        .write(|transaction| {
            let mut statement = transaction.prepare("SELECT body FROM note ORDER BY id")?;
            let bodies = statement
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?;
            Ok(bodies)
        })
        .await
        .unwrap()
}
