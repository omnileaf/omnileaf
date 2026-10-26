use std::io::{Cursor, Write};

use zip::{
    CompressionMethod, DateTime, System, ZipArchive, ZipWriter, result::ZipError,
    write::SimpleFileOptions,
};

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

/// Fixes each entry's time, permissions and host system, which a ZIP records, so the bytes never vary.
pub fn cbz(entries: &[ArchiveEntry], compression: Compression) -> Result<Vec<u8>, FixtureError> {
    let options = SimpleFileOptions::default()
        .compression_method(compression.method())
        .last_modified_time(DateTime::default())
        .system(System::Unix)
        .unix_permissions(ENTRY_PERMISSIONS);
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for entry in entries {
        writer.start_file(entry.name.as_str(), options)?;
        writer.write_all(&entry.bytes).map_err(ZipError::from)?;
    }
    Ok(writer.finish()?.into_inner())
}

pub fn cut_inside_entry(archive: &[u8], index: usize) -> Result<Vec<u8>, FixtureError> {
    let mut zip = ZipArchive::new(Cursor::new(archive))?;
    let entry = zip.by_index(index)?;
    let data_start = entry
        .data_start()
        .ok_or(ZipError::InvalidArchive("an entry with no data".into()))?;
    let cut = data_start.saturating_add(entry.compressed_size() / 2);
    let kept = archive
        .get(..usize::try_from(cut).unwrap_or(usize::MAX))
        .ok_or(ZipError::InvalidArchive(
            "an entry past the archive's end".into(),
        ))?;
    Ok(kept.to_vec())
}
