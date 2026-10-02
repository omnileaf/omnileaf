use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

use crate::FormatError;

const ZIP_SIGNATURES: [&[u8; 4]; 2] = [b"PK\x03\x04", b"PK\x05\x06"];

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
        if starts_like_a_zip(path)? {
            return Ok(Self::Zip);
        }
        Err(FormatError::Unsupported {
            path: path.to_owned(),
        })
    }
}

fn starts_like_a_zip(path: &Path) -> Result<bool, FormatError> {
    let read_failed = |source| FormatError::Read {
        path: path.to_owned(),
        source,
    };
    let mut signature = [0; 4];
    let file = File::open(path).map_err(read_failed)?;
    let read = file.take(4).read(&mut signature).map_err(read_failed)?;
    Ok(read == signature.len() && ZIP_SIGNATURES.contains(&&signature))
}
