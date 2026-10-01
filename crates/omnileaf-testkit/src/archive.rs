use std::io::{Cursor, Write};

use zip::{CompressionMethod, DateTime, ZipWriter, result::ZipError, write::SimpleFileOptions};

use crate::FixtureError;

const ENTRY_PERMISSIONS: u32 = 0o644;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Compression {
    Stored,
    Deflated,
}

impl Compression {
    const fn method(self) -> CompressionMethod {
        match self {
            Self::Stored => CompressionMethod::Stored,
            Self::Deflated => CompressionMethod::Deflated,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArchiveEntry {
    pub name: String,
    pub bytes: Vec<u8>,
}

/// A comic archive holding `entries` in the order given, with a fixed time and permissions so the bytes never vary.
pub fn cbz(entries: &[ArchiveEntry], compression: Compression) -> Result<Vec<u8>, FixtureError> {
    let options = SimpleFileOptions::default()
        .compression_method(compression.method())
        .last_modified_time(DateTime::default())
        .unix_permissions(ENTRY_PERMISSIONS);
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for entry in entries {
        writer.start_file(entry.name.as_str(), options)?;
        writer.write_all(&entry.bytes).map_err(ZipError::from)?;
    }
    Ok(writer.finish()?.into_inner())
}
