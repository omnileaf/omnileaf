use crate::{Hlc, NodeId};

/// When and where a write was made, ordered by clock and then by device.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Stamp {
    pub hlc: Hlc,
    pub node: NodeId,
}

/// How a register chooses between two writes; a field keeps its class for good.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum MergeClass {
    LastWriterWins,
    Maximum { rank: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Register {
    pub class: MergeClass,
    pub stamp: Stamp,
    /// The value's CBOR, kept as bytes so values a newer version wrote pass through unchanged.
    pub value: Vec<u8>,
}

impl Register {
    /// Keeps the later write, or a maximum's higher rank first; equal stamps, which only a cloned device makes, fall back to the value's bytes.
    #[must_use]
    pub fn merge(self, other: Self) -> Self {
        if other.precedence() > self.precedence() {
            other
        } else {
            self
        }
    }

    fn precedence(&self) -> (MergeClass, Stamp, &[u8]) {
        (self.class, self.stamp, &self.value)
    }
}
