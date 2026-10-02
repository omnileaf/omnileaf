use omnileaf_sync_proto::{Hlc, NodeId, Stamp};
use rusqlite::Connection;

use crate::Error;

/// This device's own sync state: its node id, the last stamp it gave out and the sequence number its next change takes.
pub(crate) struct LocalReplica {
    node: NodeId,
    hlc: Hlc,
    next_seq: u64,
}

impl LocalReplica {
    pub(crate) fn read(connection: &Connection) -> Result<Self, Error> {
        let local =
            connection.query_row("SELECT node_id, hlc, next_seq FROM sync_local", [], |row| {
                Ok(Self {
                    node: NodeId::from(row.get::<_, [u8; 16]>(0)?),
                    hlc: Hlc::from(row.get::<_, u64>(1)?),
                    next_seq: row.get(2)?,
                })
            })?;
        Ok(local)
    }

    pub(crate) fn stamp(&mut self, now_unix_ms: u64) -> Result<Stamp, Error> {
        self.hlc = self.hlc.tick(now_unix_ms)?;
        Ok(Stamp {
            hlc: self.hlc,
            node: self.node,
        })
    }

    pub(crate) const fn next_seq(&self) -> u64 {
        self.next_seq
    }

    /// Saturates rather than wraps, so a number past what the table stores fails to save instead of being reused.
    pub(crate) const fn advance_seq(&mut self) {
        self.next_seq = self.next_seq.saturating_add(1);
    }

    pub(crate) fn save(&self, connection: &Connection) -> Result<(), Error> {
        connection.execute(
            "UPDATE sync_local SET hlc = ?1, next_seq = ?2",
            (self.hlc.as_u64(), self.next_seq),
        )?;
        Ok(())
    }
}
