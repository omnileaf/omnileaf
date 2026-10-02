use std::{fmt, iter, str::FromStr};

use uuid::{Uuid, Variant};

use crate::{Fingerprint, norm};

const ENTITY_ID_CONTEXT: &str = "omnileaf.app 2026-09 entity-id v1";
const DERIVED_VERSION: usize = 8;
const LOCAL_BOOK_KEY: &str = "book.local.v1";
const LOCAL_SERIES_KEY: &str = "series.local.v1";
const CATEGORY_KEY: &str = "category.v1";

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

impl BookId {
    pub fn local(fingerprint: &Fingerprint) -> Result<Self, KeyError> {
        derive(LOCAL_BOOK_KEY, &[fingerprint.as_bytes()]).map(Self)
    }
}

impl SeriesId {
    pub fn local(folder_name: &str) -> Result<Self, KeyError> {
        derive(LOCAL_SERIES_KEY, &[norm(folder_name).as_bytes()]).map(Self)
    }
}

impl CategoryId {
    pub fn from_name(name: &str) -> Result<Self, KeyError> {
        derive(CATEGORY_KEY, &[norm(name).as_bytes()]).map(Self)
    }
}

fn derive(key_name: &str, parts: &[&[u8]]) -> Result<Uuid, KeyError> {
    let mut hasher = blake3::Hasher::new_derive_key(ENTITY_ID_CONTEXT);
    for field in iter::once(key_name.as_bytes()).chain(parts.iter().copied()) {
        let length = u32::try_from(field.len()).map_err(|_| KeyError::PartTooLong {
            length: field.len(),
        })?;
        hasher.update(&length.to_le_bytes());
        hasher.update(field);
    }
    let mut bytes = [0; 16];
    hasher.finalize_xof().fill(&mut bytes);
    Ok(Uuid::new_v8(bytes))
}

fn derived(uuid: Uuid) -> Result<Uuid, IdError> {
    match (uuid.get_version_num(), uuid.get_variant()) {
        (DERIVED_VERSION, Variant::RFC4122) => Ok(uuid),
        (DERIVED_VERSION, _) => Err(IdError::WrongVariant),
        (version, _) => Err(IdError::NotDerived { version }),
    }
}
