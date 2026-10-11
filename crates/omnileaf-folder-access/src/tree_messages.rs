use std::io;

use omnileaf_engine::{AndroidTree, RootLocator, TreeUri};
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};

use crate::{Document, DocumentId, PersistedGrant, place::place_of};

/// The type a documents provider gives a folder, as `DocumentsContract.Document.MIME_TYPE_DIR` names it.
const FOLDER_TYPE: &str = "vnd.android.document/directory";
const PERMISSION_DENIED: &str = "permissionDenied";
const NOT_FOUND: &str = "notFound";
const TIMED_OUT: &str = "timedOut";
const INCOMPLETE: &str = "incomplete";
const NAME_SEPARATORS: [char; 2] = ['/', '\\'];
const SEPARATOR_STAND_IN: &str = "_";
const UNREADABLE_NAME: &str = "";

#[derive(Debug)]
pub(crate) struct PickedTree(AndroidTree);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Picked {
    #[serde(deserialize_with = "tree_uri")]
    uri: TreeUri,
    document_id: String,
    name: String,
    storage_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Listing {
    documents: Vec<ListedDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListedDocument {
    id: Option<String>,
    name: Option<String>,
    mime_type: Option<String>,
    size: Option<i64>,
    last_modified: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Grants {
    grants: Vec<Grant>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Grant {
    #[serde(deserialize_with = "tree_uri")]
    uri: TreeUri,
    persisted_at_ms: i64,
}

#[derive(Debug, Serialize)]
pub(crate) struct DocumentRequest<'a> {
    tree: &'a str,
    document: Option<&'a str>,
}

#[derive(Debug, Serialize)]
pub(crate) struct GrantRequest<'a> {
    uri: &'a str,
}

impl<'de> Deserialize<'de> for PickedTree {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let picked = Picked::deserialize(deserializer)?;
        let place = place_of(
            &picked.uri,
            &picked.document_id,
            picked.storage_name.as_deref(),
        );
        AndroidTree::new(picked.uri, folder_name(&picked.name), place)
            .map(Self)
            .map_err(D::Error::custom)
    }
}

impl From<PickedTree> for RootLocator {
    fn from(picked: PickedTree) -> Self {
        Self::AndroidTree(picked.0)
    }
}

impl From<ListedDocument> for Document {
    /// A documents provider may list a negative size, which says no more than a missing one.
    fn from(listed: ListedDocument) -> Self {
        let (id, name) = match (listed.id, listed.name) {
            (Some(id), Some(name)) => (id, name),
            (None, _) | (_, None) => (String::new(), UNREADABLE_NAME.to_owned()),
        };
        Self {
            id: DocumentId::new(id),
            name,
            is_folder: listed.mime_type.as_deref() == Some(FOLDER_TYPE),
            size: listed.size.and_then(|size| u64::try_from(size).ok()),
            modified_ms: listed.last_modified,
        }
    }
}

impl Listing {
    pub(crate) fn into_documents(self) -> Vec<Document> {
        self.documents.into_iter().map(Document::from).collect()
    }
}

impl Grants {
    pub(crate) fn into_persisted(self) -> Vec<PersistedGrant> {
        self.grants
            .into_iter()
            .map(|grant| PersistedGrant {
                uri: grant.uri,
                persisted_at_ms: grant.persisted_at_ms,
            })
            .collect()
    }
}

impl<'a> DocumentRequest<'a> {
    pub(crate) fn children_of(tree: &'a TreeUri, folder: Option<&'a DocumentId>) -> Self {
        Self {
            tree: tree.as_str(),
            document: folder.map(DocumentId::as_str),
        }
    }

    pub(crate) fn document(tree: &'a TreeUri, document: &'a DocumentId) -> Self {
        Self::children_of(tree, Some(document))
    }
}

impl<'a> GrantRequest<'a> {
    pub(crate) fn of(uri: &'a TreeUri) -> Self {
        Self { uri: uri.as_str() }
    }
}

pub(crate) fn refusal_kind(code: Option<&str>) -> io::ErrorKind {
    match code {
        Some(PERMISSION_DENIED) => io::ErrorKind::PermissionDenied,
        Some(NOT_FOUND) => io::ErrorKind::NotFound,
        Some(TIMED_OUT) => io::ErrorKind::TimedOut,
        Some(INCOMPLETE) => io::ErrorKind::ResourceBusy,
        Some(_) | None => io::ErrorKind::Other,
    }
}

/// A documents provider may name a folder anything, path separators and dot names included.
fn folder_name(provided: &str) -> String {
    let name = provided.replace(NAME_SEPARATORS, SEPARATOR_STAND_IN);
    match name.as_str() {
        "" | "." | ".." => SEPARATOR_STAND_IN.repeat(name.len().max(1)),
        _ => name,
    }
}

fn tree_uri<'de, D: Deserializer<'de>>(deserializer: D) -> Result<TreeUri, D::Error> {
    TreeUri::parse(String::deserialize(deserializer)?).map_err(D::Error::custom)
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMICS_TREE: &str =
        "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FComics";

    fn comics_tree() -> TreeUri {
        TreeUri::parse(COMICS_TREE.to_owned()).unwrap()
    }

    fn picked(reply: &str) -> serde_json::Result<Option<RootLocator>> {
        serde_json::from_str::<Option<PickedTree>>(reply)
            .map(|picked| picked.map(RootLocator::from))
    }

    fn listed(documents: &str) -> Vec<Document> {
        let reply = format!(r#"{{"documents":[{documents}]}}"#);
        serde_json::from_str::<Listing>(&reply)
            .unwrap()
            .into_documents()
    }

    #[test]
    fn a_picked_tree_becomes_an_android_folder_placed_where_it_is() {
        let reply = format!(
            r#"{{"uri":"{COMICS_TREE}","documentId":"primary:Documents/Comics","name":"Comics"}}"#
        );

        let root = picked(&reply).unwrap();

        let tree = AndroidTree::new(
            comics_tree(),
            "Comics".to_owned(),
            "Internal storage › Documents".to_owned(),
        );
        assert_eq!(root, Some(RootLocator::AndroidTree(tree.unwrap())));
    }

    #[test]
    fn a_tree_on_a_removable_volume_is_placed_on_that_volume() {
        let reply = r#"{"uri":"content://com.android.externalstorage.documents/tree/1A2B-3C4D%3AComics","documentId":"1A2B-3C4D:Comics","name":"Comics","storageName":"SD card"}"#;

        let root = picked(reply).unwrap();

        assert!(matches!(root, Some(RootLocator::AndroidTree(tree)) if tree.place() == "SD card"));
    }

    #[test]
    fn a_cancelled_pick_is_no_folder() {
        let root = picked("null").unwrap();

        assert_eq!(root, None);
    }

    #[test]
    fn a_picked_address_that_is_not_a_tree_is_refused() {
        let reply =
            r#"{"uri":"content://documents.test/document/7","documentId":"7","name":"Comics"}"#;

        assert!(picked(reply).is_err());
    }

    #[test]
    fn a_picked_tree_is_named_without_the_separators_and_dots_a_folder_name_cannot_hold() {
        let names = ["Documents/Comics", "Manga\\\\Volumes", "", ".", ".."].map(|name| {
            let reply = format!(
                r#"{{"uri":"{COMICS_TREE}","documentId":"primary:Documents/Comics","name":"{name}"}}"#
            );
            match picked(&reply).unwrap() {
                Some(RootLocator::AndroidTree(tree)) => tree.name().to_owned(),
                other => panic!("expected an android folder, got {other:?}"),
            }
        });

        assert_eq!(names, ["Documents_Comics", "Manga_Volumes", "_", "_", "__"]);
    }

    #[test]
    fn a_listed_document_keeps_its_id_name_size_and_date() {
        let documents = listed(
            r#"{"id":"primary:Comics/a.cbz","name":"a.cbz","mimeType":"application/zip","size":4,"lastModified":1700000000000}"#,
        );

        assert_eq!(
            documents,
            [Document {
                id: DocumentId::new("primary:Comics/a.cbz".to_owned()),
                name: "a.cbz".to_owned(),
                is_folder: false,
                size: Some(4),
                modified_ms: Some(1_700_000_000_000),
            }]
        );
    }

    #[test]
    fn a_document_of_the_directory_type_is_a_folder() {
        let documents =
            listed(r#"{"id":"7","name":"Series","mimeType":"vnd.android.document/directory"}"#);

        assert!(documents.iter().all(|document| document.is_folder));
    }

    #[test]
    fn a_document_listed_without_a_type_is_a_file() {
        let documents = listed(r#"{"id":"7","name":"a.cbz"}"#);

        assert!(documents.iter().all(|document| !document.is_folder));
    }

    #[test]
    fn a_document_listed_without_a_size_or_date_leaves_them_unknown() {
        let documents = listed(r#"{"id":"7","name":"a.cbz","mimeType":"application/zip"}"#);

        assert!(matches!(
            documents.as_slice(),
            [Document {
                size: None,
                modified_ms: None,
                ..
            }]
        ));
    }

    #[test]
    fn a_document_listed_with_nulls_for_its_type_size_and_date_leaves_them_unknown() {
        let documents =
            listed(r#"{"id":"7","name":"a.cbz","mimeType":null,"size":null,"lastModified":null}"#);

        assert!(matches!(
            documents.as_slice(),
            [Document {
                is_folder: false,
                size: None,
                modified_ms: None,
                ..
            }]
        ));
    }

    #[test]
    fn a_document_listed_without_an_id_or_name_lists_under_no_name() {
        let documents = listed(r#"{"mimeType":"application/zip"},{"id":"7"},{"name":"a.cbz"}"#);

        let names: Vec<&str> = documents
            .iter()
            .map(|document| document.name.as_str())
            .collect();
        assert_eq!(names, ["", "", ""]);
    }

    #[test]
    fn a_negative_size_is_an_unknown_size() {
        let documents = listed(r#"{"id":"7","name":"a.cbz","size":-1}"#);

        assert!(matches!(
            documents.as_slice(),
            [Document { size: None, .. }]
        ));
    }

    #[test]
    fn persisted_grants_keep_their_tree_and_when_they_were_taken() {
        let reply = format!(r#"{{"grants":[{{"uri":"{COMICS_TREE}","persistedAtMs":42}}]}}"#);

        let grants = serde_json::from_str::<Grants>(&reply)
            .unwrap()
            .into_persisted();

        assert_eq!(
            grants,
            [PersistedGrant {
                uri: comics_tree(),
                persisted_at_ms: 42,
            }]
        );
    }

    #[test]
    fn a_grant_that_is_not_for_a_tree_is_refused() {
        let reply =
            r#"{"grants":[{"uri":"content://documents.test/document/7","persistedAtMs":42}]}"#;

        assert!(serde_json::from_str::<Grants>(reply).is_err());
    }

    #[test]
    fn asks_for_the_trees_own_folder_by_leaving_the_document_out() {
        let tree = comics_tree();

        let request = serde_json::to_value(DocumentRequest::children_of(&tree, None)).unwrap();

        assert_eq!(
            request,
            serde_json::json!({ "tree": COMICS_TREE, "document": null })
        );
    }

    #[test]
    fn asks_for_a_document_by_its_tree_and_id() {
        let tree = comics_tree();
        let id = DocumentId::new("primary:Documents/Comics/a.cbz".to_owned());

        let request = serde_json::to_value(DocumentRequest::document(&tree, &id)).unwrap();

        assert_eq!(
            request,
            serde_json::json!({ "tree": COMICS_TREE, "document": "primary:Documents/Comics/a.cbz" })
        );
    }

    #[test]
    fn releases_a_grant_by_its_tree() {
        let tree = comics_tree();

        let request = serde_json::to_value(GrantRequest::of(&tree)).unwrap();

        assert_eq!(request, serde_json::json!({ "uri": COMICS_TREE }));
    }

    #[test]
    fn reads_a_refusal_as_the_failure_it_names() {
        let kinds = [
            Some("permissionDenied"),
            Some("notFound"),
            Some("timedOut"),
            Some("incomplete"),
            Some("somethingElse"),
            None,
        ]
        .map(refusal_kind);

        assert_eq!(
            kinds,
            [
                io::ErrorKind::PermissionDenied,
                io::ErrorKind::NotFound,
                io::ErrorKind::TimedOut,
                io::ErrorKind::ResourceBusy,
                io::ErrorKind::Other,
                io::ErrorKind::Other,
            ]
        );
    }
}
