use std::{
    path::Path,
    sync::{Mutex, PoisonError},
    time::Duration,
};

use rusqlite::{Connection, Transaction, TransactionBehavior};

const MIGRATIONS: &[&str] = &[include_str!("schema.sql")];
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct Store {
    connection: Mutex<Connection>,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("use the relay's database")]
    Database(#[from] rusqlite::Error),
    #[error("the relay's database has schema {found}, newer than this relay knows")]
    NewerSchema { found: usize },
    #[error("draw random bytes")]
    Randomness(#[from] getrandom::Error),
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        Self::prepared(connection)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::prepared(Connection::open_in_memory()?)
    }

    fn prepared(mut connection: Connection) -> Result<Self, StoreError> {
        connection.busy_timeout(BUSY_TIMEOUT)?;
        connection.pragma_update(None, "foreign_keys", true)?;
        migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub(crate) fn transact<T>(
        &self,
        work: impl FnOnce(&Transaction<'_>) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        let mut connection = self
            .connection
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let outcome = work(&transaction)?;
        transaction.commit()?;
        Ok(outcome)
    }
}

fn migrate(connection: &mut Connection) -> Result<(), StoreError> {
    let applied: usize = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if applied > MIGRATIONS.len() {
        return Err(StoreError::NewerSchema { found: applied });
    }
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(applied) {
        let transaction = connection.transaction()?;
        transaction.execute_batch(migration)?;
        transaction.pragma_update(None, "user_version", index + 1)?;
        transaction.commit()?;
    }
    Ok(())
}

pub(crate) fn random_bytes<const N: usize>() -> Result<[u8; N], StoreError> {
    let mut bytes = [0; N];
    getrandom::fill(&mut bytes)?;
    Ok(bytes)
}
