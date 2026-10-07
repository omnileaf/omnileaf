use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

use crate::{FormatError, UnsupportedArchive};

const SIGNATURE_LENGTH: u64 = 6;
const ZIP_SIGNATURES: [&[u8]; 2] = [b"PK\x03\x04", b"PK\x05\x06"];
const RAR_SIGNATURE: &[u8] = b"Rar!\x1a\x07";
const SEVEN_ZIP_SIGNATURE: &[u8] = b"7z\xbc\xaf\x27\x1c";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Container {
    Folder,
    Zip,
}

impl Container {
    /// Recognises an archive by its first bytes rather than its name.
    pub(crate) fn of(path: &Path) -> Result<Self, FormatError> {
        let metadata = fs::metadata(path).map_err(|source| FormatError::Read {
            path: path.to_owned(),
            source,
        })?;
        if metadata.is_dir() {
            return Ok(Self::Folder);
        }
        let start = first_bytes(path)?;
        if ZIP_SIGNATURES
            .iter()
            .any(|signature| start.starts_with(signature))
        {
            return Ok(Self::Zip);
        }
        let path = path.to_owned();
        Err(match unsupported_archive(&start) {
            Some(archive) => FormatError::ArchiveNotSupportedYet { path, archive },
            None => FormatError::Unsupported { path },
        })
    }
}

fn unsupported_archive(start: &[u8]) -> Option<UnsupportedArchive> {
    if start.starts_with(RAR_SIGNATURE) {
        Some(UnsupportedArchive::Rar)
    } else if start.starts_with(SEVEN_ZIP_SIGNATURE) {
        Some(UnsupportedArchive::SevenZip)
    } else {
        None
    }
}

fn first_bytes(path: &Path) -> Result<Vec<u8>, FormatError> {
    let read_failed = |source| FormatError::Read {
        path: path.to_owned(),
        source,
    };
    let mut start = Vec::new();
    File::open(path)
        .map_err(read_failed)?
        .take(SIGNATURE_LENGTH)
        .read_to_end(&mut start)
        .map_err(read_failed)?;
    Ok(start)
}
