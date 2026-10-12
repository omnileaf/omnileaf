use std::{
    fs::File,
    io,
    os::fd::{FromRawFd, OwnedFd, RawFd},
};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct OpenedDocument {
    fd: RawFd,
}

impl TryFrom<OpenedDocument> for File {
    type Error = io::Error;

    fn try_from(opened: OpenedDocument) -> io::Result<Self> {
        if opened.fd < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("the plugin handed over descriptor {}", opened.fd),
            ));
        }
        Ok(Self::from(adopt(opened.fd)))
    }
}

#[expect(
    unsafe_code,
    reason = "the plugin hands a descriptor over as a bare number, which only an unsafe call can take ownership of"
)]
fn adopt(fd: RawFd) -> OwnedFd {
    // SAFETY: `fd` is non-negative and came from `ParcelFileDescriptor.detachFd()` in this process, which gave up the plugin's ownership of the open descriptor and never touches it again, and each reply is read once, so this `OwnedFd` is its only owner.
    unsafe { OwnedFd::from_raw_fd(fd) }
}

#[cfg(test)]
mod tests {
    use std::{io::Read, os::fd::IntoRawFd};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    fn opened(fd: RawFd) -> OpenedDocument {
        serde_json::from_str(&format!(r#"{{"fd":{fd}}}"#)).unwrap()
    }

    #[test]
    fn reads_the_document_through_the_descriptor_it_was_handed() {
        let folder = ScratchFolder::new("descriptor");
        let book = folder.write("a.cbz", b"book");
        let fd = File::open(book).unwrap().into_raw_fd();

        let mut file = File::try_from(opened(fd)).unwrap();

        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"book");
    }

    #[test]
    fn refuses_a_descriptor_that_cannot_be_open() {
        let file = File::try_from(opened(-1));

        assert_eq!(file.unwrap_err().kind(), io::ErrorKind::InvalidData);
    }
}
