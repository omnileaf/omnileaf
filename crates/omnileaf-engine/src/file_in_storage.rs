use std::{path::PathBuf, sync::Arc};

use omnileaf_formats::Storage;

pub(crate) struct FileInStorage {
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) path: PathBuf,
}
