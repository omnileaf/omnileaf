use std::collections::BTreeSet;

use omnileaf_sync_proto::{MergeClass, Register, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        Changed,
        key::{Key, LatestKey, MaximumKey},
        local::LocalReplica,
        register,
    },
};

/// The writes one [`crate::store::Store::write`] job makes, each stamped later than the one before.
pub struct Writer<'t> {
    connection: &'t Connection,
    local: LocalReplica,
    now_unix_ms: u64,
    changed: BTreeSet<Key>,
}

impl<'t> Writer<'t> {
    pub(crate) fn begin(connection: &'t Connection, now_unix_ms: u64) -> Result<Self, Error> {
        Ok(Self {
            connection,
            local: LocalReplica::read(connection)?,
            now_unix_ms,
            changed: BTreeSet::new(),
        })
    }

    pub fn set(&mut self, key: LatestKey, value: Value) -> Result<(), Error> {
        self.write(key.into(), MergeClass::LastWriterWins, value)
    }

    /// Writes null, which outlives every earlier value so a stale device cannot bring one back.
    pub fn clear(&mut self, key: LatestKey) -> Result<(), Error> {
        self.set(key, Value::Null)
    }

    /// Changes nothing, and takes no sequence number, unless `rank` is above the stored write's or level with it.
    pub fn raise(&mut self, key: MaximumKey, rank: u32, value: Value) -> Result<(), Error> {
        self.write(key.into(), MergeClass::Maximum { rank }, value)
    }

    fn write(&mut self, key: Key, class: MergeClass, value: Value) -> Result<(), Error> {
        let register = Register {
            class,
            stamp: self.local.stamp(self.now_unix_ms)?,
            value: value.to_cbor(),
        };
        let seq = self.local.next_seq();
        if register::upsert(self.connection, &key.address(), &register, seq)? {
            self.local.advance_seq();
            self.changed.insert(key);
        }
        Ok(())
    }

    pub(crate) fn finish(self) -> Result<Changed, Error> {
        self.local.save(self.connection)?;
        Ok(Changed { keys: self.changed })
    }
}
