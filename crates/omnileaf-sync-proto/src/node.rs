pub const NODE_ID_LENGTH: usize = 16;

/// The device that made a write, by the id it picked at random when its library was created.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct NodeId([u8; NODE_ID_LENGTH]);

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum NodeIdError {
    #[error("read a node id: {length} bytes where a node id has {NODE_ID_LENGTH}")]
    WrongLength { length: usize },
}

impl NodeId {
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; NODE_ID_LENGTH] {
        &self.0
    }
}

impl From<[u8; NODE_ID_LENGTH]> for NodeId {
    fn from(bytes: [u8; NODE_ID_LENGTH]) -> Self {
        Self(bytes)
    }
}

impl TryFrom<&[u8]> for NodeId {
    type Error = NodeIdError;

    fn try_from(bytes: &[u8]) -> Result<Self, NodeIdError> {
        bytes
            .try_into()
            .map(Self)
            .map_err(|_| NodeIdError::WrongLength {
                length: bytes.len(),
            })
    }
}
