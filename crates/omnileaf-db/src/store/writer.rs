use omnileaf_sync_proto::{MergeClass, Register, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        key::{Address, LatestKey},
        local::LocalReplica,
        register,
    },
};

/// The writes one [`crate::store::Store::write`] job makes, each stamped later than the one before.
pub struct Writer<'t> {
    connection: &'t Connection,
    local: LocalReplica,
    now_unix_ms: u64,
}

impl<'t> Writer<'t> {
    pub(crate) fn begin(connection: &'t Connection, now_unix_ms: u64) -> Result<Self, Error> {
        Ok(Self {
            connection,
            local: LocalReplica::read(connection)?,
            now_unix_ms,
        })
    }

    pub fn set(&mut self, key: LatestKey, value: Value) -> Result<(), Error> {
        self.write(&key.address(), MergeClass::LastWriterWins, value)?;
        Ok(())
    }

    fn write(&mut self, address: &Address, class: MergeClass, value: Value) -> Result<bool, Error> {
        let register = Register {
            class,
            stamp: self.local.stamp(self.now_unix_ms)?,
            value: value.to_cbor(),
        };
        let won = register::upsert(self.connection, address, &register, self.local.next_seq())?;
        if won {
            self.local.advance_seq();
        }
        Ok(won)
    }

    pub(crate) fn finish(self) -> Result<(), Error> {
        self.local.save(self.connection)
    }
}
