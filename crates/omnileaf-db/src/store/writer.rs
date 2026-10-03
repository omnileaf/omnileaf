use std::collections::BTreeSet;

use omnileaf_sync_proto::{BookId, MergeClass, Register, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        Changed,
        key::{Key, LatestKey, MaximumKey},
        local::LocalReplica,
        projector, register,
    },
};

/// The writes one [`crate::store::Store::write`] job makes, each stamped later than the one before.
pub struct Writer<'t> {
    connection: &'t Connection,
    local: LocalReplica,
    now_unix_ms: u64,
    changed: BTreeSet<Key>,
    has_failed: bool,
}

impl<'t> Writer<'t> {
    pub(crate) fn begin(connection: &'t Connection, now_unix_ms: u64) -> Result<Self, Error> {
        Ok(Self {
            connection,
            local: LocalReplica::read(connection)?,
            now_unix_ms,
            changed: BTreeSet::new(),
            has_failed: false,
        })
    }

    #[tracing::instrument(skip_all, fields(%book, page))]
    pub fn set_position(&mut self, book: BookId, page: u32) -> Result<(), Error> {
        self.set(LatestKey::BookPosition(book), Value::Unsigned(page.into()))
    }

    #[tracing::instrument(skip_all, fields(%book, is_read))]
    pub fn set_read(&mut self, book: BookId, is_read: bool) -> Result<(), Error> {
        self.set(LatestKey::BookRead(book), Value::Bool(is_read))
    }

    /// Writes null, which outlives every earlier value so a stale device cannot bring one back.
    #[tracing::instrument(skip_all, fields(?key))]
    pub fn clear(&mut self, key: LatestKey) -> Result<(), Error> {
        self.set(key, Value::Null)
    }

    /// Changes nothing, and takes no sequence number, unless `page` is at or past the furthest page stored.
    #[tracing::instrument(skip_all, fields(%book, page))]
    pub fn raise_furthest(&mut self, book: BookId, page: u32) -> Result<(), Error> {
        let furthest = MaximumKey::BookFurthest(book);
        let class = MergeClass::Maximum { rank: page };
        self.write(furthest.into(), class, Value::Unsigned(page.into()))
    }

    fn set(&mut self, key: LatestKey, value: Value) -> Result<(), Error> {
        self.write(key.into(), MergeClass::LastWriterWins, value)
    }

    /// Fails every later write and the commit once one write fails, so no job can keep half of one.
    fn write(&mut self, key: Key, class: MergeClass, value: Value) -> Result<(), Error> {
        if self.has_failed {
            return Err(Error::FailedWriteIgnored);
        }
        let written = self.merge(key, class, value);
        self.has_failed = written.is_err();
        written
    }

    fn merge(&mut self, key: Key, class: MergeClass, value: Value) -> Result<(), Error> {
        let register = Register {
            class,
            stamp: self.local.stamp(self.now_unix_ms)?,
            value: value.to_cbor(),
        };
        let seq = self.local.next_seq();
        if register::upsert(self.connection, &key.address(), &register, seq)? {
            projector::project(self.connection, key, value)?;
            self.local.advance_seq();
            self.changed.insert(key);
        }
        Ok(())
    }

    pub(crate) fn finish(self) -> Result<Changed, Error> {
        if self.has_failed {
            return Err(Error::FailedWriteIgnored);
        }
        self.local.save(self.connection)?;
        Ok(Changed::Registers { keys: self.changed })
    }
}
