use std::{path::Path, sync::Arc};

use omnileaf_engine::{AndroidTree, Library, describe_error};
use omnileaf_folder_access::{DocumentTree, FolderAccess};
use tauri::{App, Manager, Wry};

use crate::cache_folder;

const STREAMED_COPIES_FOLDER: &str = "streamed-documents";

pub(crate) fn read_trees(app: &App, library: Library, data_dir: Option<&Path>) -> Library {
    let cache = match cache_folder(app, data_dir) {
        Ok(cache) => cache,
        Err(error) => {
            tracing::error!(
                error = %describe_error(&error),
                "find the cache folder, so Android folders stay unreachable"
            );
            return library;
        }
    };
    let access = app.state::<FolderAccess<Wry>>().inner().clone();
    let copies = cache.join(STREAMED_COPIES_FOLDER);
    library.reading_trees_with(Arc::new(move |tree: &AndroidTree| {
        Arc::new(DocumentTree::new(access.clone(), tree, copies.clone()))
    }))
}
