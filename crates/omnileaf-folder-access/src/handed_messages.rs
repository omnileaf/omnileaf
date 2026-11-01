use std::{fs::File, io, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::{DocumentUri, HandedDocument, descriptor::OpenedDocument};

#[derive(Debug, Serialize)]
pub(crate) struct HandedRequest<'a> {
    uri: &'a str,
}

#[derive(Debug, Deserialize)]
pub(crate) struct HandedReply {
    #[serde(flatten)]
    opened: OpenedDocument,
    name: Option<String>,
}

impl<'a> HandedRequest<'a> {
    pub(crate) fn of(uri: &'a DocumentUri) -> Self {
        Self { uri: uri.as_str() }
    }
}

impl HandedReply {
    pub(crate) fn into_document(self, copies: PathBuf) -> io::Result<HandedDocument> {
        HandedDocument::copied(self.name.as_deref(), File::try_from(self.opened)?, copies)
    }
}

#[cfg(test)]
mod tests {
    use std::{io::Read, os::fd::IntoRawFd};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const BOOK: &[u8] = b"book";

    #[test]
    fn asks_for_a_document_by_its_address() {
        let uri = DocumentUri::parse("content://documents.test/document/42".to_owned()).unwrap();

        let request = serde_json::to_string(&HandedRequest::of(&uri)).unwrap();

        assert_eq!(request, r#"{"uri":"content://documents.test/document/42"}"#);
    }

    #[test]
    fn hands_over_the_document_a_reply_names_and_describes() {
        let folder = ScratchFolder::new("handed-reply");
        let fd = File::open(folder.write("source", BOOK))
            .unwrap()
            .into_raw_fd();
        let reply: HandedReply =
            serde_json::from_str(&format!(r#"{{"fd":{fd},"name":"Odd Tale.cbz"}}"#)).unwrap();

        let document = reply.into_document(folder.path().join("copies")).unwrap();

        let (storage, path) = document.into_storage();
        let mut bytes = Vec::new();
        storage
            .open(&path)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(
            (path, bytes),
            (PathBuf::from("Odd Tale.cbz"), BOOK.to_vec())
        );
    }

    #[test]
    fn reads_a_reply_that_names_nothing() {
        let reply: HandedReply = serde_json::from_str(r#"{"fd":-1}"#).unwrap();

        assert!(reply.name.is_none());
    }

    #[test]
    fn refuses_a_reply_without_a_descriptor() {
        let reply = serde_json::from_str::<HandedReply>(r#"{"name":"Odd Tale.cbz"}"#);

        assert!(reply.is_err());
    }
}
