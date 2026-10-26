use omnileaf_sync_proto::{Hlc, NODE_ID_LENGTH, NodeId, ProfileId, Stamp};
use rusqlite::Connection;

use crate::{Error, catalog::stored_id::stored_id};

pub(crate) struct LocalReplica {
    node: NodeId,
    hlc: Hlc,
    next_seq: u64,
    profile: ProfileId,
}

impl LocalReplica {
    pub(crate) fn read(connection: &Connection) -> Result<Self, Error> {
        let local = connection.query_row(
            "SELECT node_id, hlc, next_seq, profile FROM sync_local",
            [],
            |row| {
                Ok(Self {
                    node: NodeId::from(row.get::<_, [u8; NODE_ID_LENGTH]>("node_id")?),
                    hlc: Hlc::from(row.get::<_, u64>("hlc")?),
                    next_seq: row.get("next_seq")?,
                    profile: stored_id(row, "profile")?,
                })
            },
        )?;
        Ok(local)
    }

    pub(crate) const fn profile(&self) -> ProfileId {
        self.profile
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

    /// SQLite integers stop at `i64::MAX`, so a saturated number fails to save rather than being reused.
    pub(crate) const fn advance_seq_saturating(&mut self) {
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
