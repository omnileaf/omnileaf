use std::{
    ffi::OsString,
    fs::File,
    io,
    os::fd::AsRawFd,
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::{streamed_copy::StreamedCopies, tree_messages::one_name};
use omnileaf_formats::{Details, Entry, Storage};

const CONTENT_SCHEME: &str = "content://";
const UNNAMED_DOCUMENT: &str = "Comic";

/// The address of one document a request handed to the app.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentUri(String);

/// A document a request handed to the app, copied into a private file so it outlives the request's grant.
#[derive(Debug)]
pub struct HandedDocument {
    name: String,
    copy: File,
}

#[derive(Debug)]
struct HandedDocumentStorage {
    name: OsString,
    copy: File,
}

impl DocumentUri {
    pub fn parse(uri: String) -> io::Result<Self> {
        let authority = uri
            .strip_prefix(CONTENT_SCHEME)
            .and_then(|rest| rest.chars().next());
        if authority.is_some_and(|first| first != '/') {
            Ok(Self(uri))
        } else {
            Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{uri:?} isn't the address of a document"),
            ))
        }
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl HandedDocument {
    /// Copies the document into `copies`, since the provider may stream it and the grant ends with the request.
    pub fn copied(name: Option<&str>, document: File, copies: PathBuf) -> io::Result<Self> {
        let name = match name {
            Some(name) if !name.is_empty() => one_name(name),
            Some(_) | None => UNNAMED_DOCUMENT.to_owned(),
        };
        let copy = StreamedCopies::new(copies).copy(document)?;
        Ok(Self { name, copy })
    }

    /// The storage that holds only this document, and the path to read it at.
    #[must_use]
    pub fn into_storage(self) -> (Arc<dyn Storage>, PathBuf) {
        let path = PathBuf::from(&self.name);
        let storage = HandedDocumentStorage {
            name: self.name.into(),
            copy: self.copy,
        };
        (Arc::new(storage), path)
    }
}

impl HandedDocumentStorage {
    fn is_the_document(&self, path: &Path) -> io::Result<()> {
        if path == Path::new(&self.name) {
            Ok(())
        } else {
            Err(io::ErrorKind::NotFound.into())
        }
    }
}

impl Storage for HandedDocumentStorage {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        self.is_the_document(folder)?;
        Err(io::ErrorKind::NotADirectory.into())
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        self.is_the_document(path)?;
        Ok(Details::File {
            size: self.copy.metadata()?.len(),
            modified: None,
        })
    }

    /// An unlinked file reopens through `/proc/self/fd` on Linux and Android with a position of its own, where `try_clone` would share one.
    fn open(&self, file: &Path) -> io::Result<File> {
        self.is_the_document(file)?;
        File::open(format!("/proc/self/fd/{}", self.copy.as_raw_fd()))
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Seek, SeekFrom};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const BOOK: &[u8] = b"book";

    struct Handed {
        _folder: ScratchFolder,
        storage: Arc<dyn Storage>,
        path: PathBuf,
    }

    fn handed(name: Option<&str>) -> Handed {
        let folder = ScratchFolder::new("handed");
        let document = File::open(folder.write("source", BOOK)).unwrap();
        let copies = folder.path().join("copies");
        let (storage, path) = HandedDocument::copied(name, document, copies)
            .unwrap()
            .into_storage();
        Handed {
            _folder: folder,
            storage,
            path,
        }
    }

    fn read_all(mut file: File) -> Vec<u8> {
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn reads_the_document_it_was_handed_under_its_name() {
        let handed = handed(Some("Odd Tale.cbz"));

        let file = handed.storage.open(&handed.path).unwrap();

        assert_eq!(
            (handed.path, read_all(file)),
            (PathBuf::from("Odd Tale.cbz"), BOOK.to_vec())
        );
    }

    #[test]
    fn opens_the_document_again_with_a_position_of_its_own() {
        let handed = handed(Some("Odd Tale.cbz"));
        let mut first = handed.storage.open(&handed.path).unwrap();
        first.seek(SeekFrom::Start(2)).unwrap();

        let second = handed.storage.open(&handed.path).unwrap();

        assert_eq!(read_all(second), BOOK);
    }

    #[test]
    fn sizes_the_document_it_holds() {
        let handed = handed(Some("Odd Tale.cbz"));

        let details = handed.storage.details(&handed.path).unwrap();

        assert_eq!(
            details,
            Details::File {
                size: 4,
                modified: None
            }
        );
    }

    #[test]
    fn finds_nothing_else_in_the_storage() {
        let handed = handed(Some("Odd Tale.cbz"));

        let opened = handed.storage.open(Path::new("Other.cbz"));

        assert_eq!(opened.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn names_the_document_without_the_separators_a_file_name_cannot_hold() {
        let handed = handed(Some("Comics/Odd Tale.cbz"));

        assert_eq!(handed.path, PathBuf::from("Comics_Odd Tale.cbz"));
    }

    #[test]
    fn names_a_document_the_provider_did_not_name() {
        let named = [handed(None).path, handed(Some("")).path];

        assert_eq!(named, [PathBuf::from("Comic"), PathBuf::from("Comic")]);
    }

    #[test]
    fn leaves_no_copy_in_the_folder_it_copied_into() {
        let folder = ScratchFolder::new("handed-copies");
        let document = File::open(folder.write("source", BOOK)).unwrap();
        let copies = folder.path().join("copies");

        let _kept = HandedDocument::copied(Some("a.cbz"), document, copies.clone()).unwrap();

        assert_eq!(std::fs::read_dir(copies).unwrap().count(), 0);
    }

    #[test]
    fn takes_the_address_of_a_document() {
        let uri = DocumentUri::parse("content://documents.test/document/42".to_owned());

        assert_eq!(
            uri.unwrap().as_str(),
            "content://documents.test/document/42"
        );
    }

    #[test]
    fn refuses_an_address_that_is_not_a_content_address() {
        let refused = [
            "file:///data/data/app.omnileaf/databases/library.db",
            "/sdcard/a.cbz",
            "https://example.test/a.cbz",
            "content://",
            "content:///no-authority",
            "",
        ]
        .map(|uri| DocumentUri::parse(uri.to_owned()).is_err());

        assert_eq!(refused, [true; 6]);
    }
}
