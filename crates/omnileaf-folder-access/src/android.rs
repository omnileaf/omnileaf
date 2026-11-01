use std::{fmt, fs::File, io, path::PathBuf};

use omnileaf_engine::{RootLocator, TreeUri};
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

use crate::{
    Document, DocumentId, DocumentUri, Documents, HandedDocument, PersistedGrant,
    descriptor::OpenedDocument,
    handed_messages::{HandedReply, HandedRequest},
    tree_messages::{DocumentRequest, GrantRequest, Grants, Listing, PickedTree, refusal_kind},
};

const PLUGIN_NAME: &str = "folder-access";
const ANDROID_PACKAGE: &str = "app.omnileaf.folderaccess";
const ANDROID_PLUGIN_CLASS: &str = "FolderAccessPlugin";
const PICK_FOLDER: &str = "pickFolder";
const LIST_DOCUMENTS: &str = "listDocuments";
const OPEN_DOCUMENT: &str = "openDocument";
const OPEN_HANDED_DOCUMENT: &str = "openHandedDocument";
const DELETE_DOCUMENT: &str = "deleteDocument";
const PERSISTED_GRANTS: &str = "persistedGrants";
const RELEASE_GRANT: &str = "releaseGrant";

pub struct FolderAccess<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Clone for FolderAccess<R> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<R: Runtime> fmt::Debug for FolderAccess<R> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FolderAccess")
            .finish_non_exhaustive()
    }
}

#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            app.manage(FolderAccess(
                api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?,
            ));
            Ok(())
        })
        .build()
}

impl<R: Runtime> FolderAccess<R> {
    /// Waits for the person to pick a folder or cancel, so it must not run on the main thread.
    pub fn pick_folder(&self) -> Result<Option<RootLocator>, PluginInvokeError> {
        let picked: Option<PickedTree> = self.0.run_mobile_plugin(PICK_FOLDER, ())?;
        Ok(picked.map(RootLocator::from))
    }

    /// Waits for the provider and for the copy of the document into `copies`, so it must not run on the main thread.
    pub fn open_handed_document(
        &self,
        uri: &DocumentUri,
        copies: PathBuf,
    ) -> io::Result<HandedDocument> {
        let reply: HandedReply = self
            .0
            .run_mobile_plugin(OPEN_HANDED_DOCUMENT, HandedRequest::of(uri))
            .map_err(io_error)?;
        reply.into_document(copies)
    }

    pub fn persisted_grants(&self) -> Result<Vec<PersistedGrant>, PluginInvokeError> {
        let grants: Grants = self.0.run_mobile_plugin(PERSISTED_GRANTS, ())?;
        Ok(grants.into_persisted())
    }

    pub fn release_grant(&self, tree: &TreeUri) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin(RELEASE_GRANT, GrantRequest::of(tree))
    }
}

impl<R: Runtime> Documents for FolderAccess<R> {
    fn children(&self, tree: &TreeUri, folder: Option<&DocumentId>) -> io::Result<Vec<Document>> {
        let listing: Listing = self
            .0
            .run_mobile_plugin(LIST_DOCUMENTS, DocumentRequest::children_of(tree, folder))
            .map_err(io_error)?;
        Ok(listing.into_documents())
    }

    fn open(&self, tree: &TreeUri, document: &DocumentId) -> io::Result<File> {
        let opened: OpenedDocument = self
            .0
            .run_mobile_plugin(OPEN_DOCUMENT, DocumentRequest::document(tree, document))
            .map_err(io_error)?;
        File::try_from(opened)
    }

    fn delete(&self, tree: &TreeUri, document: &DocumentId) -> io::Result<()> {
        self.0
            .run_mobile_plugin(DELETE_DOCUMENT, DocumentRequest::document(tree, document))
            .map_err(io_error)
    }
}

fn io_error(error: PluginInvokeError) -> io::Error {
    let kind = match &error {
        PluginInvokeError::InvokeRejected(refused) => refusal_kind(refused.code.as_deref()),
        _ => io::ErrorKind::Other,
    };
    io::Error::new(kind, error)
}
