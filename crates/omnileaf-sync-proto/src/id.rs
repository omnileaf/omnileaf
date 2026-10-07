use std::{fmt, str::FromStr};

use uuid::{Uuid, Variant};

use crate::{Fingerprint, norm};

const ENTITY_ID_CONTEXT: &str = "omnileaf.app 2026-09 entity-id v1";
const DERIVED_VERSION: usize = 8;
const LOCAL_BOOK_KEY: KeyName = KeyName::new("book.local.v1");
const LOCAL_SERIES_KEY: KeyName = KeyName::new("series.local.v1");
const CATEGORY_KEY: KeyName = KeyName::new("category.v1");
const LOCAL_SOURCE_KEY: KeyName = KeyName::new("source.local.v1");

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum KeyError {
    #[error(
        "derive an entity id: a natural key part of {length} bytes does not fit its 32-bit length prefix"
    )]
    PartTooLong { length: usize },
}

#[derive(Debug, thiserror::Error)]
pub enum IdError {
    #[error("parse an entity id: the text is not a UUID")]
    Malformed(#[source] uuid::Error),
    #[error("read an entity id: {length} bytes where an id has 16")]
    WrongLength { length: usize },
    #[error("read an entity id: a version {version} UUID where a derived id has version 8")]
    NotDerived { version: usize },
    #[error("read an entity id: a UUID of a variant other than RFC 9562's")]
    WrongVariant,
}

macro_rules! entity_id {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(Uuid);

        impl $name {
            #[must_use]
            pub const fn as_bytes(&self) -> &[u8; 16] {
                self.0.as_bytes()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                fmt::Display::fmt(&self.0.hyphenated(), f)
            }
        }

        impl FromStr for $name {
            type Err = IdError;

            fn from_str(text: &str) -> Result<Self, IdError> {
                let uuid = Uuid::parse_str(text).map_err(IdError::Malformed)?;
                derived(uuid).map(Self)
            }
        }

        impl TryFrom<&[u8]> for $name {
            type Error = IdError;

            fn try_from(bytes: &[u8]) -> Result<Self, IdError> {
                let uuid = Uuid::from_slice(bytes).map_err(|_| IdError::WrongLength {
                    length: bytes.len(),
                })?;
                derived(uuid).map(Self)
            }
        }
    };
}

entity_id!(BookId);
entity_id!(SeriesId);
entity_id!(CategoryId);
entity_id!(SourceId);

impl BookId {
    #[must_use]
    pub fn local(fingerprint: &Fingerprint) -> Self {
        Self(
            NaturalKey::new(LOCAL_BOOK_KEY)
                .fixed_part(fingerprint.as_bytes())
                .id(),
        )
    }
}

impl SeriesId {
    pub fn local(folder_name: &str) -> Result<Self, KeyError> {
        let key = NaturalKey::new(LOCAL_SERIES_KEY).part(norm(folder_name).as_bytes())?;
        Ok(Self(key.id()))
    }
}

impl CategoryId {
    pub fn from_name(name: &str) -> Result<Self, KeyError> {
        let key = NaturalKey::new(CATEGORY_KEY).part(norm(name).as_bytes())?;
        Ok(Self(key.id()))
    }
}

impl SourceId {
    #[must_use]
    pub fn local() -> Self {
        Self(NaturalKey::new(LOCAL_SOURCE_KEY).id())
    }
}

#[derive(Clone, Copy)]
struct KeyName {
    length_prefix: [u8; 4],
    name: &'static str,
}

impl KeyName {
    const fn new(name: &'static str) -> Self {
        Self {
            length_prefix: fixed_length_prefix(name.len()),
            name,
        }
    }
}

/// Only for lengths known at compile time, where the assertion fails the build rather than panicking.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the assertion keeps the length within u32"
)]
const fn fixed_length_prefix(length: usize) -> [u8; 4] {
    assert!(length <= u32::MAX as usize);
    (length as u32).to_le_bytes()
}

struct NaturalKey(blake3::Hasher);

impl NaturalKey {
    fn new(key_name: KeyName) -> Self {
        let mut hasher = blake3::Hasher::new_derive_key(ENTITY_ID_CONTEXT);
        hasher.update(&key_name.length_prefix);
        hasher.update(key_name.name.as_bytes());
        Self(hasher)
    }

    fn fixed_part<const LENGTH: usize>(mut self, part: &[u8; LENGTH]) -> Self {
        self.0.update(&const { fixed_length_prefix(LENGTH) });
        self.0.update(part);
        self
    }

    fn part(mut self, part: &[u8]) -> Result<Self, KeyError> {
        let length =
            u32::try_from(part.len()).map_err(|_| KeyError::PartTooLong { length: part.len() })?;
        self.0.update(&length.to_le_bytes());
        self.0.update(part);
        Ok(self)
    }

    fn id(&self) -> Uuid {
        let mut bytes = [0; 16];
        self.0.finalize_xof().fill(&mut bytes);
        Uuid::new_v8(bytes)
    }
}

fn derived(uuid: Uuid) -> Result<Uuid, IdError> {
    match (uuid.get_version_num(), uuid.get_variant()) {
        (DERIVED_VERSION, Variant::RFC4122) => Ok(uuid),
        (DERIVED_VERSION, _) => Err(IdError::WrongVariant),
        (version, _) => Err(IdError::NotDerived { version }),
    }
}
