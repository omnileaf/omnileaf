use std::{fmt, str::FromStr};

use crate::CacheError;

/// A name that is always a plain file name, so an entry can never land outside the cache folder.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CacheKey(String);

impl CacheKey {
    pub const MAX_LENGTH: usize = 128;

    pub(crate) fn as_file_name(&self) -> &str {
        &self.0
    }
}

impl FromStr for CacheKey {
    type Err = CacheError;

    fn from_str(text: &str) -> Result<Self, CacheError> {
        let is_plain = (1..=Self::MAX_LENGTH).contains(&text.len())
            && text
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if is_plain {
            Ok(Self(text.to_owned()))
        } else {
            Err(CacheError::MalformedKey {
                text: text.to_owned(),
            })
        }
    }
}

impl fmt::Display for CacheKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}
