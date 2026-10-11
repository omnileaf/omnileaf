use crate::{Hlc, NodeId};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Stamp {
    pub hlc: Hlc,
    pub node: NodeId,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum MergeClass {
    LastWriterWins,
    Maximum { rank: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Register {
    pub class: MergeClass,
    pub stamp: Stamp,
    pub value: Vec<u8>,
}

impl Register {
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
