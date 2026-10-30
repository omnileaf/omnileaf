use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

use crate::{Details, FormatError, Storage, UnsupportedArchive, error::read_failed};

const SIGNATURE_LENGTH: u64 = 8;
const ZIP_SIGNATURES: [&[u8]; 2] = [b"PK\x03\x04", b"PK\x05\x06"];
const RAR_SIGNATURE: &[u8] = b"Rar!\x1a\x07";
const SEVEN_ZIP_SIGNATURE: &[u8] = b"7z\xbc\xaf\x27\x1c";

#[derive(Debug)]
pub(crate) enum Container {
    Folder,
    Zip(File),
    SevenZip(File),
    #[cfg(feature = "rar")]
    Rar(File),
}

impl Container {
    /// Recognises an archive by its magic bytes rather than its file extension.
    pub(crate) fn of(storage: &dyn Storage, path: &Path) -> Result<Self, FormatError> {
        if let Details::Folder { .. } = storage.details(path).map_err(read_failed(path))? {
            return Ok(Self::Folder);
        }
        let mut file = storage.open(path).map_err(read_failed(path))?;
        let start = first_bytes(&mut file).map_err(read_failed(path))?;
        if ZIP_SIGNATURES
            .iter()
            .any(|signature| start.starts_with(signature))
        {
            return Ok(Self::Zip(file));
        }
        if start.starts_with(SEVEN_ZIP_SIGNATURE) {
            return Ok(Self::SevenZip(file));
        }
        #[cfg(feature = "rar")]
        if crate::rar_header::is_readable_rar(&start) {
            return Ok(Self::Rar(file));
        }
        let path = path.to_owned();
        Err(if start.starts_with(RAR_SIGNATURE) {
            FormatError::ArchiveNotSupportedYet {
                path,
                archive: UnsupportedArchive::Rar,
            }
        } else {
            FormatError::Unsupported { path }
        })
    }
}

fn first_bytes(file: &mut File) -> io::Result<Vec<u8>> {
    let mut start = Vec::new();
    file.by_ref()
        .take(SIGNATURE_LENGTH)
        .read_to_end(&mut start)?;
    Ok(start)
}
