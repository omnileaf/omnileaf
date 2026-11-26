use std::{path::PathBuf, sync::Arc};

use omnileaf_db::catalog::{RootId, RootKind};
use omnileaf_formats::Storage;

use crate::file_type::HiddenFileTypes;

#[derive(Clone)]
pub(crate) struct Target {
    pub(crate) root: RootId,
    pub(crate) kind: RootKind,
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) folder: PathBuf,
    pub(crate) hidden: HiddenFileTypes,
    pub(crate) added_at_ms: i64,
}
