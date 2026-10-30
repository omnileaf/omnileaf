use std::fmt;

use serde::Serialize;

use crate::limits::REPLY_ADDRESS_BYTES;

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct ReplyAddress(String);

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum InvalidReplyAddress {
    #[error("a reply address is at most 254 bytes")]
    TooLong,
    #[error("a reply address needs an @")]
    NoAt,
    #[error("a reply address can't hold spaces or control characters")]
    Whitespace,
}

impl ReplyAddress {
    pub fn parse(text: &str) -> Result<Self, InvalidReplyAddress> {
        if text.len() > REPLY_ADDRESS_BYTES {
            return Err(InvalidReplyAddress::TooLong);
        }
        if text
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
        {
            return Err(InvalidReplyAddress::Whitespace);
        }
        if !text.contains('@') {
            return Err(InvalidReplyAddress::NoAt);
        }
        Ok(Self(text.to_owned()))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for ReplyAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ReplyAddress(..)")
    }
}
